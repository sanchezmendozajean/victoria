import {
  AutosavePolicy,
  createDocument,
  DocumentSession,
  peekVict,
  randomIds,
  readEps,
  readVict,
  writeVict,
  type EpsWarning,
  type IdGenerator,
  type Selection,
} from '../../core';
import type { AutosaveEntry, DialogLabels, OpenedFile, SaveRequest, SaveResult } from '../../shared/ipc';

/** The slice of `window.victoria` the manager needs; tests pass a fake. */
export interface FilesPort {
  openFile(labels: DialogLabels): Promise<OpenedFile | null>;
  saveFile(request: SaveRequest): Promise<SaveResult | null>;
  autosaveWrite(docId: string, bytes: Uint8Array): Promise<void>;
  autosaveDiscard(docId: string): Promise<void>;
  autosaveList(): Promise<AutosaveEntry[]>;
  autosaveRead(docId: string): Promise<Uint8Array | null>;
}

export type CloseChoice = 'save' | 'discard' | 'cancel';

/** Everything that talks to the user: dialogs live in the UI layer, not here. */
export interface Prompts {
  askSaveBeforeClose(name: string): Promise<CloseChoice>;
  reportError(message: string): Promise<void>;
}

/** User-visible default names (the core has no i18n). */
export interface Names {
  untitled(n: number): string;
  space(n: number): string;
  artboard(n: number): string;
  layer(n: number): string;
  openFailed(reason: string): string;
  /** Notice after opening an EPS: what was left out (already joined, e.g. "texto, imágenes"). */
  epsSkipped(items: string): string;
  epsItem(code: EpsWarning['code']): string;
  saveFailed: string;
  openLabels: DialogLabels;
  saveLabels: DialogLabels;
}

export interface ManagerDeps {
  files: FilesPort;
  prompts: Prompts;
  names: Names;
  appVersion: string;
  ids?: IdGenerator;
  /** ms clock; injectable for tests. */
  clock?: () => number;
}

export interface OpenDocument {
  /** Stable key of the tab and of its autosave file (not the document's own meta.id). */
  id: string;
  session: DocumentSession;
  /** Absolute path of the .vict, or null while the document has never been saved. */
  path: string | null;
  policy: AutosavePolicy;
  /** True while an autosave file exists for this document. */
  hasAutosave: boolean;
}

export interface Recoverable {
  docId: string;
  name: string;
  modified: number;
}

const lastSelections = new WeakMap<DocumentSession, Selection>();

/** The last non-empty selection of a document (Selección › Volver a seleccionar). */
export const lastSelectionOf = (session: DocumentSession): Selection | undefined => lastSelections.get(session);

const fileName = (file: string) => file.split(/[\\/]/).pop() ?? file;

export function displayName(doc: OpenDocument): string {
  return doc.path ? fileName(doc.path) : `${doc.session.document.meta.name}.vict`;
}

/**
 * Open documents, the active one, saving, closing and autosave. Framework-free so it can be tested
 * in Node; the React side subscribes through `subscribe`/`version`.
 */
export class DocumentManager {
  private docs_: OpenDocument[] = [];
  private activeId_: string | null = null;
  private version_ = 0;
  private readonly listeners = new Set<() => void>();
  private readonly ids: IdGenerator;
  private readonly clock: () => number;

  constructor(private readonly deps: ManagerDeps) {
    this.ids = deps.ids ?? randomIds;
    this.clock = deps.clock ?? (() => Date.now());
  }

  // ── State for the UI ──

  get documents(): readonly OpenDocument[] {
    return this.docs_;
  }
  get active(): OpenDocument | null {
    return this.docs_.find((d) => d.id === this.activeId_) ?? null;
  }
  get version(): number {
    return this.version_;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version_;

  private changed(): void {
    this.version_++;
    for (const listener of this.listeners) listener();
  }

  // ── Creating and opening ──

  private adopt(session: DocumentSession, path: string | null, autosaveId = this.ids(), hasAutosave = false): OpenDocument {
    const doc: OpenDocument = {
      id: autosaveId,
      session,
      path,
      policy: new AutosavePolicy(session.revision, this.clock()),
      hasAutosave,
    };
    session.subscribe(() => {
      if (session.selection.ids.length > 0) lastSelections.set(session, session.selection);
      this.changed();
    });
    this.docs_ = [...this.docs_, doc];
    this.activeId_ = doc.id;
    this.changed();
    return doc;
  }

  private nextUntitled(): number {
    const used = new Set(this.docs_.map((d) => d.session.document.meta.name));
    let n = 1;
    while (used.has(this.deps.names.untitled(n))) n++;
    return n;
  }

  newDocument(): OpenDocument {
    const { names } = this.deps;
    const ids = this.ids;
    const document = createDocument({
      name: names.untitled(this.nextUntitled()),
      spaceName: names.space(1),
      artboardName: names.artboard(1),
      layerName: names.layer(1),
      ids,
      now: new Date(this.clock()).toISOString(),
    });
    return this.adopt(new DocumentSession(document, { ids }), null);
  }

  /** Opens the dialog, reads and validates. Already-open files are just activated. */
  async open(): Promise<OpenDocument | null> {
    const picked = await this.deps.files.openFile(this.deps.names.openLabels).catch((e: unknown) => this.fail(this.deps.names.openFailed(String(e))));
    if (!picked) return null;
    const existing = this.docs_.find((d) => d.path === picked.path);
    if (existing) {
      this.activate(existing.id);
      return existing;
    }
    try {
      if (/\.epsf?$/i.test(picked.path)) return await this.importEps(picked);
      const { document } = readVict(picked.bytes);
      return this.adopt(new DocumentSession(document, { ids: this.ids }), picked.path);
    } catch (error) {
      await this.deps.prompts.reportError(this.deps.names.openFailed(error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  /** An EPS opens as a new, unsaved document with one artboard of the size of its bounding box. */
  private async importEps(picked: { path: string; bytes: Uint8Array }): Promise<OpenDocument> {
    const { names } = this.deps;
    const result = readEps(picked.bytes, this.ids);
    const base = picked.path.split(/[\\/]/).pop() ?? picked.path;
    const document = createDocument({
      name: base.replace(/\.[^.]+$/, ''),
      spaceName: names.space(1),
      artboardName: names.artboard(1),
      layerName: names.layer(1),
      ids: this.ids,
      now: new Date(this.clock()).toISOString(),
    });
    const space = document.spaces[0];
    const board = space?.artboards[0];
    const layer = space?.layers[0];
    if (!space || !board || !layer) throw new Error('Invalid new document');
    board.w = result.width;
    board.h = result.height;
    delete board.preset;
    layer.children = result.nodes as typeof layer.children;
    const opened = this.adopt(new DocumentSession(document, { ids: this.ids }), null);
    const skipped = [...new Set(result.warnings.map((w) => names.epsItem(w.code)))];
    if (skipped.length > 0) await this.deps.prompts.reportError(names.epsSkipped(skipped.join(', ')));
    return opened;
  }

  private async fail(message: string): Promise<null> {
    await this.deps.prompts.reportError(message);
    return null;
  }

  activate(id: string): void {
    if (this.activeId_ === id || !this.docs_.some((d) => d.id === id)) return;
    this.activeId_ = id;
    this.changed();
  }

  // ── Saving ──

  async save(id = this.activeId_): Promise<boolean> {
    return this.write(id, false);
  }

  async saveAs(id = this.activeId_): Promise<boolean> {
    return this.write(id, true);
  }

  private async write(id: string | null, forceDialog: boolean): Promise<boolean> {
    const doc = this.docs_.find((d) => d.id === id);
    if (!doc) return false;
    const { files, names, appVersion } = this.deps;
    try {
      const bytes = writeVict({ document: doc.session.document, app: appVersion });
      const result = await files.saveFile({
        path: forceDialog ? null : doc.path,
        suggestedName: displayName(doc),
        bytes,
        labels: names.saveLabels,
      });
      if (!result) return false;
      doc.path = result.path;
      doc.session.markSaved(); // emits → UI refresh
      doc.policy.markSaved(doc.session.revision, this.clock());
      await this.dropAutosave(doc);
      this.changed();
      return true;
    } catch (error) {
      await this.deps.prompts.reportError(`${names.saveFailed} ${error instanceof Error ? error.message : ''}`.trim());
      return false;
    }
  }

  // ── Closing ──

  /** Returns false when the user cancels. The last document is replaced by a fresh one. */
  async close(id = this.activeId_): Promise<boolean> {
    const doc = this.docs_.find((d) => d.id === id);
    if (!doc) return false;
    if (doc.session.dirty) {
      const choice = await this.deps.prompts.askSaveBeforeClose(displayName(doc));
      if (choice === 'cancel') return false;
      if (choice === 'save' && !(await this.save(doc.id))) return false;
    }
    await this.dropAutosave(doc);
    const index = this.docs_.findIndex((d) => d.id === doc.id);
    this.docs_ = this.docs_.filter((d) => d.id !== doc.id);
    if (this.activeId_ === doc.id) this.activeId_ = (this.docs_[Math.min(index, this.docs_.length - 1)] ?? null)?.id ?? null;
    if (this.docs_.length === 0) this.newDocument();
    else this.changed();
    return true;
  }

  // ── Autosave and recovery ──

  private async dropAutosave(doc: OpenDocument): Promise<void> {
    if (!doc.hasAutosave) return;
    await this.deps.files.autosaveDiscard(doc.id).catch(() => undefined);
    doc.hasAutosave = false;
  }

  private async writeAutosave(doc: OpenDocument): Promise<void> {
    const bytes = writeVict({ document: doc.session.document, app: this.deps.appVersion });
    await this.deps.files.autosaveWrite(doc.id, bytes);
    doc.hasAutosave = true;
    doc.policy.markSaved(doc.session.revision, this.clock());
  }

  /** Called every few seconds: autosaves changed documents every 60 s and removes stale files. */
  async tickAutosave(): Promise<void> {
    for (const doc of this.docs_) {
      try {
        if (!doc.session.dirty) await this.dropAutosave(doc);
        else if (doc.policy.shouldSave(doc.session.revision, this.clock())) await this.writeAutosave(doc);
      } catch {
        // A failed autosave is retried on the next tick; it must never interrupt the user.
      }
    }
  }

  /** Window is closing: unsaved work goes to the autosave folder now, clean documents leave no trace. */
  async flushAutosaves(): Promise<void> {
    await Promise.all(
      this.docs_.map(async (doc) => {
        try {
          if (doc.session.dirty) await this.writeAutosave(doc);
          else await this.dropAutosave(doc);
        } catch {
          // Nothing more can be done while closing.
        }
      }),
    );
  }

  /** Autosave files left by a previous session. Unreadable ones are removed. */
  async findRecoverable(): Promise<Recoverable[]> {
    const { files } = this.deps;
    const found: Recoverable[] = [];
    for (const entry of await files.autosaveList().catch(() => [] as AutosaveEntry[])) {
      const bytes = await files.autosaveRead(entry.docId).catch(() => null);
      const info = bytes ? peekVict(bytes) : null;
      if (info) found.push({ docId: entry.docId, name: info.name, modified: entry.modified });
      else await files.autosaveDiscard(entry.docId).catch(() => undefined);
    }
    return found;
  }

  /** Opens a recovered document as unsaved (it keeps its autosave file until saved or discarded). */
  async recover(docId: string): Promise<OpenDocument | null> {
    const bytes = await this.deps.files.autosaveRead(docId).catch(() => null);
    if (!bytes) return null;
    try {
      const { document } = readVict(bytes);
      const session = new DocumentSession(document, { ids: this.ids });
      session.markUnsaved();
      return this.adopt(session, null, docId, true);
    } catch {
      await this.deps.files.autosaveDiscard(docId).catch(() => undefined);
      return null;
    }
  }

  async discardRecoverable(docId: string): Promise<void> {
    await this.deps.files.autosaveDiscard(docId).catch(() => undefined);
  }
}
