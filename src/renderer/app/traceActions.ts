import { create } from 'zustand';
import { expandTrace, frameOf, makeTrace, paramsForPreset, retrace, selectOnly, setTraceView, type GroupNode, type ImageNode, type TraceParams, type TracePresetId, type TraceView } from '../../core';
import { t } from '../i18n';
import { decodePixels, runTrace, type TraceJob } from '../trace/tracer';
import { askUser } from './dialogs';
import { imageFactsOf } from './imageObjectActions';
import { actionContext } from './selectionActions';

interface TraceState {
  running: boolean;
  /** 0-1 while running. */
  progress: number;
}
export const useTrace = create<TraceState>(() => ({ running: false, progress: 0 }));

let current: TraceJob | null = null;

/** Stops the trace in progress, if any (the Cancelar button). */
export function cancelTrace(): void {
  current?.cancel();
}

/** Decodes the picture and traces it in a worker; null when cancelled or when it fails (the user is told). */
async function traceBytes(bytes: Uint8Array, params: TraceParams) {
  cancelTrace();
  useTrace.setState({ running: true, progress: 0 });
  try {
    const pixels = await decodePixels(bytes);
    const job = runTrace(pixels, params, (progress) => useTrace.setState({ progress }));
    current = job;
    return await job.result;
  } catch (error) {
    if (!(error instanceof Error && error.name === 'Cancelled')) {
      await askUser({ title: t('dialog.error'), message: t('trace.failed'), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
    }
    return null;
  } finally {
    current = null;
    useTrace.setState({ running: false, progress: 0 });
  }
}

/** The live trace group the selection stands for, with its source picture. */
function selectedTrace() {
  const c = actionContext();
  const id = c && c.ids.length === 1 ? c.ids[0] : undefined;
  const node = c && id ? frameOf(c.space, id)?.node : undefined;
  return c && node && node.type === 'group' && node.trace ? { c, group: node as GroupNode & { trace: NonNullable<GroupNode['trace']> } } : null;
}

/** Calco de imagen: the selected image becomes a live group of flat-colour paths. */
export async function traceSelectedImage(preset: TracePresetId = 'colors16'): Promise<void> {
  const c = actionContext();
  const id = c && c.ids.length === 1 ? c.ids[0] : undefined;
  const facts = c && id ? imageFactsOf(c.session, c.space, id) : null;
  if (!c || !facts || facts.crop || facts.image.id !== id) return;
  const image: ImageNode = facts.image;
  const bytes = c.session.images.get(image.resourceId);
  if (!bytes) return;
  const params = paramsForPreset(preset);
  const result = await traceBytes(bytes, params);
  if (!result || !frameOf(c.space, image.id)) return;
  const { command, group } = makeTrace(c.session.ids, c.space.id, image, params, result);
  c.session.run(command, selectOnly(c.space.id, [group.id]));
}

/** New settings for a live trace: the paths are computed again from the same picture. */
export async function retraceSelected(params: TraceParams): Promise<void> {
  const s = selectedTrace();
  if (!s) return;
  const { c, group } = s;
  const bytes = c.session.images.get(group.trace.resourceId);
  if (!bytes) return;
  const result = await traceBytes(bytes, params);
  const still = result ? frameOf(c.space, group.id)?.node : undefined;
  if (!result || !still || still.type !== 'group' || !still.trace) return;
  c.session.run(retrace(c.session.ids, c.space.id, still, params, result));
}

/** Vista of the selected live trace: what the canvas shows (the result, outlines, the original picture…). */
export function setSelectedTraceView(view: TraceView): void {
  const s = selectedTrace();
  if (s) s.c.session.run(setTraceView(s.c.space.id, s.group, view));
}

/** Expandir: the paths stay, the link with the picture ends. */
export function expandSelectedTrace(): void {
  const s = selectedTrace();
  if (s) s.c.session.run(expandTrace(s.c.space.id, s.group));
}
