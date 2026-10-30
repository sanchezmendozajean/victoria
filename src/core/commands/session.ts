import { applyPatches, enablePatches, freeze, produce, produceWithPatches, type Patch } from 'immer';
import { ImageStore } from '../io/imageStore';
import { randomIds, type IdGenerator } from '../model/ids';
import { getSpace } from '../model/queries';
import type { Document, SpaceView } from '../model/types';
import { emptySelection, pruneSelection, type Selection } from '../selection/selection';
import type { Command } from './command';

enablePatches();

export const DEFAULT_HISTORY_LIMIT = 200;

interface HistoryEntry {
  label: string;
  spaceId: string | undefined;
  mergeKey: string | undefined;
  patches: Patch[];
  inverse: Patch[];
  selectionBefore: Selection;
  selectionAfter: Selection;
  /** Changes whenever the entry changes (creation or merge); used to tell whether the document is saved. */
  serial: number;
}

export type ChangeKind = 'run' | 'undo' | 'redo' | 'view' | 'space' | 'select' | 'saved';

export interface SessionChange {
  kind: ChangeKind;
  document: Document;
  patches: Patch[];
}

export interface SessionOptions {
  historyLimit?: number;
  ids?: IdGenerator;
  /** ISO timestamp provider; injectable for deterministic tests. */
  now?: () => string;
  /** Bytes of the images the document uses (a document opened from a .vict brings its own). */
  images?: ImageStore;
}

/**
 * One open document: immutable state + history + selection (specs/02 · Comandos e historial).
 * The history belongs to the document (not to a Space), so undo crosses Spaces.
 */
export class DocumentSession {
  readonly ids: IdGenerator;
  readonly images: ImageStore;
  private doc: Document;
  private sel: Selection;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private limit: number;
  private readonly now: () => string;
  private serialCounter = 0;
  private savedSerial: number;
  private rev = 0;
  private readonly listeners = new Set<(change: SessionChange) => void>();

  constructor(document: Document, options: SessionOptions = {}) {
    // Immutable from here on (every edit is a command): lookups can be indexed per version of a Space.
    this.doc = freeze(document, true);
    this.limit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.ids = options.ids ?? randomIds;
    this.images = options.images ?? new ImageStore();
    this.now = options.now ?? (() => new Date().toISOString());
    this.sel = emptySelection(document.activeSpaceId);
    this.savedSerial = 0; // a freshly opened document has an empty history and is clean
  }

  // ── State ──

  get document(): Document {
    return this.doc;
  }
  get selection(): Selection {
    return this.sel;
  }
  /** Bumps on every content change (run, undo, redo); not on selection, view or active Space. */
  get revision(): number {
    return this.rev;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }
  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }
  get historyLength(): number {
    return this.undoStack.length;
  }
  /** True when the content differs from the last save (or from opening, if never saved). */
  get dirty(): boolean {
    return this.topSerial() !== this.savedSerial;
  }

  setHistoryLimit(limit: number): void {
    this.limit = Math.max(1, limit);
    this.trim();
  }

  /** A recovered or imported document has content that exists nowhere on disk yet. */
  markUnsaved(): void {
    this.savedSerial = -1;
    this.emit({ kind: 'saved', document: this.doc, patches: [] });
  }

  markSaved(): void {
    this.savedSerial = this.topSerial();
    this.emit({ kind: 'saved', document: this.doc, patches: [] });
  }

  subscribe(listener: (change: SessionChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Content changes (recorded) ──

  /**
   * Runs a command. Returns false when it changed nothing (no history entry is created).
   * `nextSelection` is what the selection becomes; the entry remembers both sides for undo/redo.
   */
  run(command: Command, nextSelection?: Selection): boolean {
    const [afterApply, applyPatchesList, applyInverse] = produceWithPatches(this.doc, (draft) => command.apply(draft));
    if (applyPatchesList.length === 0) return false;
    const [next, stampPatches, stampInverse] = produceWithPatches(afterApply, (draft) => {
      draft.meta.modified = this.now();
    });
    const patches = [...applyPatchesList, ...stampPatches];
    const inverse = [...stampInverse, ...applyInverse];

    const selectionBefore = this.sel;
    const selectionAfter = nextSelection ?? this.sel;
    const top = this.undoStack.at(-1);
    this.redoStack = [];

    if (top && command.mergeKey !== undefined && top.mergeKey === command.mergeKey && top.spaceId === command.spaceId) {
      top.patches = [...top.patches, ...patches];
      top.inverse = [...inverse, ...top.inverse];
      top.selectionAfter = selectionAfter;
      top.serial = ++this.serialCounter;
    } else {
      this.undoStack.push({
        label: command.label,
        spaceId: command.spaceId,
        mergeKey: command.mergeKey,
        patches,
        inverse,
        selectionBefore,
        selectionAfter,
        serial: ++this.serialCounter,
      });
      this.trim();
    }

    this.doc = next;
    this.sel = pruneSelection(this.doc, selectionAfter);
    this.rev++;
    this.emit({ kind: 'run', document: this.doc, patches });
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    this.doc = this.followEntrySpace(applyPatches(this.doc, entry.inverse), entry);
    this.sel = pruneSelection(this.doc, entry.selectionBefore);
    this.rev++;
    this.emit({ kind: 'undo', document: this.doc, patches: entry.inverse });
    return true;
  }

  /** Undoes the last step and forgets it (no redo): a cancelled dialog preview or drag. */
  rollback(): boolean {
    if (!this.undo()) return false;
    this.redoStack.pop();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    this.doc = this.followEntrySpace(applyPatches(this.doc, entry.patches), entry);
    this.sel = pruneSelection(this.doc, entry.selectionAfter);
    this.rev++;
    this.emit({ kind: 'redo', document: this.doc, patches: entry.patches });
    return true;
  }

  // ── State changes that are not history steps ──

  select(selection: Selection): void {
    this.sel = pruneSelection(this.doc, selection);
    this.emit({ kind: 'select', document: this.doc, patches: [] });
  }

  /** Switching Space is not undoable (specs/04 · regla 4). */
  setActiveSpace(spaceId: string): void {
    if (spaceId === this.doc.activeSpaceId || !getSpace(this.doc, spaceId)) return;
    this.doc = produce(this.doc, (draft) => {
      draft.activeSpaceId = spaceId;
    });
    this.sel = emptySelection(spaceId);
    this.emit({ kind: 'space', document: this.doc, patches: [] });
  }

  /** Zoom and pan are per Space, saved with the file, but neither undoable nor "changes". */
  setSpaceView(spaceId: string, view: SpaceView): void {
    if (!getSpace(this.doc, spaceId)) return;
    this.doc = produce(this.doc, (draft) => {
      const space = draft.spaces.find((s) => s.id === spaceId);
      if (space) space.view = view;
    });
    this.emit({ kind: 'view', document: this.doc, patches: [] });
  }

  // ── Internals ──

  /** Undoing something done in another Space brings that Space to the front. */
  private followEntrySpace(doc: Document, entry: HistoryEntry): Document {
    const target = entry.spaceId;
    if (!target || target === doc.activeSpaceId || !getSpace(doc, target)) return doc;
    return produce(doc, (draft) => {
      draft.activeSpaceId = target;
    });
  }

  private topSerial(): number {
    return this.undoStack.at(-1)?.serial ?? 0;
  }

  private trim(): void {
    const excess = this.undoStack.length - this.limit;
    if (excess > 0) this.undoStack.splice(0, excess);
  }

  private emit(change: SessionChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
