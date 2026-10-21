import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addModifier,
  combineCommands,
  defaultParams,
  getModifier,
  locateNode,
  newModifier,
  updateModifier,
  type DocumentSession,
  type ModifierInstance,
  type ParamField,
  type Params,
} from '../../core';
import { ptToUnit, unitToPt } from '../canvas/units';
import { NumberInput } from '../components/NumberInput';
import { useDocuments } from '../documents';
import { t, type TranslationKey } from '../i18n';
import { CheckRow, Choice, Row, Slider } from '../panels/kit';
import { modifierLabelKey } from './modifierActions';
import { useUi } from './store';
import '../components/DialogHost.css';
import './TransformDialog.css';

/**
 * Dialog generated from a modifier's schema (specs/05 · UI): numeric fields with wheel and expressions, sliders,
 * a "Previsualizar" check (on by default) and Cancelar / Aceptar. The preview is one history step that the
 * dialog keeps editing; Cancelar rolls it back.
 */
export function ModifierDialog() {
  const dialog = useUi((s) => s.modifierDialog);
  const documents = useDocuments();
  const session = documents.active?.session;
  if (!dialog || !session) return null;
  return <ModifierForm key={`${dialog.modifierId}:${dialog.edit?.modId ?? 'new'}:${dialog.nodeIds.join(',')}`} dialog={dialog} session={session} />;
}

let dialogCounter = 0;

const optionLabel = (value: string): string => t(`modifier.option.${value}` as TranslationKey);
const fieldLabel = (key: string): string => t(`modifier.param.${key}` as TranslationKey);

function ModifierForm({ dialog, session }: { dialog: NonNullable<ReturnType<typeof useUi.getState>['modifierDialog']>; session: DocumentSession }) {
  const close = useUi((s) => s.closeModifierDialog);
  const setLast = useUi((s) => s.setLastModifier);
  const def = getModifier(dialog.modifierId);
  const units = session.document.meta.units;
  const space = session.document.spaces.find((sp) => sp.id === session.document.activeSpaceId) ?? session.document.spaces[0];

  /** The parameters the dialog starts with: the stored ones when editing, else the last used, else the defaults. */
  const initial = useMemo<Params>(() => {
    const base = defaultParams(dialog.modifierId);
    if (dialog.edit && space) {
      const node = locateNode(space, dialog.edit.nodeId)?.node;
      const item = node?.appearance.items.find((i) => i.kind === 'modifier' && i.mod.id === dialog.edit?.modId);
      if (item && item.kind === 'modifier') for (const [k, v] of Object.entries(item.mod.params)) if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') base[k] = v;
    } else {
      const last = useUi.getState().lastModifier;
      if (last && last.modifierId === dialog.modifierId) Object.assign(base, last.params);
    }
    return base;
  }, [dialog, space]);

  const [params, setParams] = useState<Params>(initial);
  const [preview, setPreview] = useState(true);
  const key = useRef(`dialog${++dialogCounter}`);
  const touched = useRef(false);
  const instances = useRef<Map<string, ModifierInstance>>(new Map());

  /** Writes the current parameters into the document: the first write makes the step, the next ones merge into it. */
  const write = (merge: boolean) => {
    if (!space) return;
    const mergeKey = merge ? `modifier.dialog:${key.current}` : undefined;
    if (dialog.edit) {
      session.run(updateModifier(space.id, dialog.edit.nodeId, dialog.edit.modId, { params }, mergeKey));
      return;
    }
    if (!touched.current) {
      for (const nodeId of dialog.nodeIds) instances.current.set(nodeId, newModifier(session.ids, dialog.modifierId, params));
      session.run(addModifier(space.id, [...instances.current].map(([nodeId, mod]) => ({ nodeId, mod, ...(dialog.target ? { target: dialog.target } : {}) })), mergeKey));
      return;
    }
    session.run(combineCommands('modifier.edit', [...instances.current].map(([nodeId, mod]) => updateModifier(space.id, nodeId, mod.id, { params }, mergeKey))));
  };

  // Live preview: each change of a parameter updates the one step the dialog owns.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!preview) return;
    }
    if (!preview) {
      if (touched.current) {
        session.rollback();
        touched.current = false;
        instances.current.clear();
      }
      return;
    }
    write(true);
    touched.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, preview]);

  if (!def) return null;

  const cancel = () => {
    if (touched.current) session.rollback();
    close();
  };
  const accept = () => {
    if (!touched.current) write(false);
    setLast({ modifierId: dialog.modifierId, params });
    close();
  };

  const set = (field: string, value: number | string | boolean) => setParams((p) => ({ ...p, [field]: value }));

  const renderField = (field: ParamField) => {
    const value = params[field.key];
    const label = fieldLabel(field.key);
    switch (field.type) {
      case 'number': {
        const raw = typeof value === 'number' ? value : 0;
        const length = field.unit === 'length';
        const shown = length ? ptToUnit(raw, units) : raw;
        const suffix = length ? units : field.unit === 'percent' ? '%' : field.unit === 'angle' ? '°' : undefined;
        const commit = (v: number) => set(field.key, length ? unitToPt(v, units) : v);
        return (
          <div key={field.key}>
            <Row>
              <span className="vc-plabel" style={{ flex: 1 }}>{label}</span>
              <NumberInput value={shown} onCommit={commit} suffix={suffix} {...(length ? { lengthUnit: units } : {})} min={field.min !== undefined && length ? ptToUnit(field.min, units) : field.min} max={field.max} step={field.step ?? 1} decimals={field.decimals ?? 3} width={96} testId={`mod-${field.key}`} tooltip={label} />
            </Row>
            {field.slider && field.min !== undefined && field.max !== undefined && (
              <Row>
                <Slider value={raw} min={field.min} max={field.max} step={field.step ?? 1} onChange={(v) => set(field.key, v)} label={label} testId={`mod-${field.key}-slider`} />
              </Row>
            )}
          </div>
        );
      }
      case 'select':
        return (
          <Row key={field.key}>
            <span className="vc-plabel" style={{ flex: 1 }}>{label}</span>
            <Choice label={label} value={String(value ?? '')} width={130} testId={`mod-${field.key}`} options={field.options.map((o) => ({ id: o, label: optionLabel(o) }))} onChange={(v) => set(field.key, v)} />
          </Row>
        );
      case 'boolean':
        return <CheckRow key={field.key} checked={value === true} label={label} testId={`mod-${field.key}`} onChange={(v) => set(field.key, v)} />;
      case 'color':
        return (
          <Row key={field.key}>
            <span className="vc-plabel" style={{ flex: 1 }}>{label}</span>
            <input type="color" aria-label={label} data-testid={`mod-${field.key}`} value={typeof value === 'string' ? value : '#000000'} onChange={(e) => set(field.key, e.target.value)} />
          </Row>
        );
    }
  };

  const titleKey = modifierLabelKey(dialog.modifierId);
  const title = (titleKey ? t(titleKey) : dialog.modifierId).replace(/…$/, '');

  return (
    <div className="vc-dialog__backdrop" data-testid="modifier-dialog">
      <form
        className="vc-dialog vc-transform"
        role="dialog"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          accept();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      >
        <h2 className="vc-dialog__title">{title}</h2>
        {def.schema.length === 0 ? <p className="vc-dialog__message">{t('modifier.noParams')}</p> : def.schema.map(renderField)}
        <div className="vc-dialog__buttons vc-transform__footer">
          <CheckRow checked={preview} label={t('modifier.preview')} testId="mod-preview" onChange={setPreview} />
          <span className="vc-transform__spacer" />
          <button type="button" className="vc-dialog__button" data-testid="mod-cancel" onClick={cancel}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="vc-dialog__button vc-dialog__button--primary" data-testid="mod-ok">
            {t('dialog.ok')}
          </button>
        </div>
      </form>
    </div>
  );
}
