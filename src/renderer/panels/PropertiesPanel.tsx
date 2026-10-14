import { commonStrokeField, locateNode, setColorMode, setUnits, type Node, type Units } from '../../core';
import { arrangeSelection, groupSelection, ungroupSelection } from '../app/selectionActions';
import { nodeIcon, nodeLabel } from '../app/nodeLabels';
import { applyObjectLook, applyStroke } from '../app/paintActions';
import { useUi, type ViewOptions } from '../app/store';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t } from '../i18n';
import { AlignButtons } from './AlignPanel';
import { CheckRow, Choice, PaintChip, Row, Section } from './kit';
import { usePanelContext, type PanelContext } from './context';
import { usePaintLook } from './PaintWidget';
import { ShapeParams } from './ShapeParams';
import { TransformPanel } from './TransformPanel';

/** Propiedades (specs/06): changes with the selection — document settings, or transform, appearance, align and quick actions. */
export function PropertiesPanel() {
  const ctx = usePanelContext();
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;
  return ctx.ids.length === 0 ? <DocumentProperties /> : <ObjectProperties />;
}

function DocumentProperties() {
  const ctx = usePanelContext();
  const view = useUi((s) => s.viewOptions);
  const toggle = useUi((s) => s.toggleViewOption);
  const setTool = useUi((s) => s.setActiveTool);
  const active = useUi((s) => s.activeArtboard);
  if (!ctx) return null;
  const meta = ctx.session.document.meta;
  const board = ctx.space.artboards.find((a) => a.id === active[ctx.space.id]) ?? ctx.space.artboards[0];
  const check = (key: keyof ViewOptions, label: Parameters<typeof t>[0], testId: string) => <CheckRow checked={view[key]} onChange={() => toggle(key)} label={t(label)} testId={testId} />;
  return (
    <div className="vc-panelbody" data-testid="properties-document">
      <div className="vc-propheader">
        <Icon id="document-setup" size={16} />
        <span>{t('properties.document')}</span>
      </div>
      <Section title={t('properties.documentSection')}>
        <Row>
          <span className="vc-plabel" style={{ width: 80 }}>{t('properties.units')}</span>
          <Choice
            value={meta.units}
            label={t('properties.units')}
            testId="properties-units"
            width={110}
            options={(['px', 'mm', 'cm', 'pt', 'in'] as Units[]).map((u) => ({ id: u, label: u }))}
            onChange={(u) => ctx.session.run(setUnits(u as Units))}
          />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 80 }}>{t('properties.colorMode')}</span>
          <Choice
            value={meta.colorMode}
            label={t('properties.colorMode')}
            testId="properties-color-mode"
            width={110}
            options={[
              { id: 'rgb', label: 'RGB' },
              { id: 'cmyk', label: 'CMYK' },
            ]}
            onChange={(m) => ctx.session.run(setColorMode(m as 'rgb' | 'cmyk'))}
          />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 80 }}>{t('properties.artboard')}</span>
          <span data-testid="properties-artboard">{board?.name ?? '—'}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="vc-pbutton" data-testid="properties-edit-artboards" onClick={() => setTool('tool-artboard')}>
            <Icon id="tool-artboard" size={16} />
            {t('properties.editArtboards')}
          </button>
        </Row>
      </Section>
      <Section title={t('properties.rulersGrids')}>
        {check('rulers', 'menu.view.rulers', 'properties-rulers')}
        {check('grid', 'menu.view.grid', 'properties-grid')}
        {check('guides', 'menu.view.guides', 'properties-guides')}
      </Section>
      <Section title={t('properties.snapTo')}>
        {check('snapGrid', 'menu.view.snapGrid', 'properties-snap-grid')}
        {check('smartGuides', 'menu.view.smartGuides', 'properties-smart-guides')}
      </Section>
      <Section title={t('properties.quick')}>
        {check('hideEdges', 'menu.view.hideEdges', 'properties-hide-edges')}
        {check('outline', 'menu.view.outline', 'properties-outline')}
      </Section>
    </div>
  );
}

function ObjectProperties() {
  const ctx = usePanelContext();
  const { look, resources } = usePaintLook();
  const setActive = useUi((s) => s.setActivePaint);
  const openPicker = useUi((s) => s.openColorPicker);
  const setIsolation = useUi((s) => s.setIsolation);
  if (!ctx) return null;
  const first = ctx.leaves[0];
  const selectedNode = ctx.ids.length === 1 ? findNode(ctx, ctx.ids[0] as string) : null;
  const weight = commonStrokeField(ctx.leaves, 'width');
  const isGroup = !!selectedNode && (selectedNode.type === 'group' || selectedNode.type === 'clipGroup');
  const chip = (target: 'fill' | 'stroke') => (
    <button type="button" className="vc-propchip" data-testid={`properties-${target}`} {...tip(t(target === 'fill' ? 'control.fill' : 'control.stroke'))} onClick={() => { setActive(target); openPicker(target); }}>
      <PaintChip paint={look[target].mixed ? null : (look[target] as { value: Parameters<typeof PaintChip>[0]['paint'] }).value} mixed={look[target].mixed} resources={resources} size={18} />
    </button>
  );
  return (
    <div className="vc-panelbody" data-testid="properties-object">
      <div className="vc-propheader" data-testid="properties-title">
        <Icon id={selectedNode ? nodeIcon(selectedNode) : 'group'} size={16} />
        <span>{selectedNode ? nodeLabel(selectedNode) : t('control.objects', { count: ctx.ids.length })}</span>
      </div>
      <Section title={t('transform.title')}>
        <TransformPanel compact />
      </Section>
      <ShapeParams />
      <Section title={t('properties.appearance')}>
        <Row>
          <Icon id="fill" size={14} className="vc-field__icon" />
          <span className="vc-plabel" style={{ width: 56 }}>{t('toolbar.fill')}</span>
          {chip('fill')}
        </Row>
        <Row>
          <Icon id="stroke" size={14} className="vc-field__icon" />
          <span className="vc-plabel" style={{ width: 56 }}>{t('toolbar.stroke')}</span>
          {chip('stroke')}
          <span style={{ flex: 1 }} />
          <NumberInput icon="stroke-weight" suffix="pt" value={weight && !weight.mixed ? Math.round(weight.value * 1000) / 1000 : null} onCommit={(v) => applyStroke({ width: v })} min={0} step={0.5} decimals={3} width={88} testId="properties-weight" tooltip={t('control.strokeWeight')} />
        </Row>
        <Row>
          <Icon id="opacity" size={14} className="vc-field__icon" />
          <span className="vc-plabel" style={{ width: 56 }}>{t('fill.opacity')}</span>
          <NumberInput value={look.opacity.mixed ? null : Math.round(look.opacity.value * 100)} onCommit={(v) => applyObjectLook({ opacity: v / 100 })} suffix="%" min={0} max={100} decimals={0} width={80} testId="properties-opacity" tooltip={t('fill.opacity')} />
        </Row>
      </Section>
      <Section title={t('properties.align')}>
        <AlignButtons testId="properties-align" />
      </Section>
      <Section title={t('properties.quickActions')}>
        <div className="vc-pgrid">
          <button type="button" className="vc-pbutton" data-testid="quick-group" disabled={ctx.ids.length < 1} onClick={groupSelection}>
            <Icon id="group" size={14} />
            {t('menu.object.group')}
          </button>
          <button type="button" className="vc-pbutton" data-testid="quick-ungroup" disabled={!isGroup} onClick={ungroupSelection}>
            <Icon id="ungroup" size={14} />
            {t('menu.object.ungroup')}
          </button>
          <button type="button" className="vc-pbutton" data-testid="quick-isolate" disabled={!isGroup} onClick={() => selectedNode && setIsolation(ctx.space.id, selectedNode.id)}>
            <Icon id="isolate" size={14} />
            {t('control.isolate')}
          </button>
          <button type="button" className="vc-pbutton" data-testid="quick-front" onClick={() => arrangeSelection('front')}>
            <Icon id="arrange-front" size={14} />
            {t('menu.object.bringToFront')}
          </button>
          <button type="button" className="vc-pbutton" data-testid="quick-back" onClick={() => arrangeSelection('back')}>
            <Icon id="arrange-back" size={14} />
            {t('menu.object.sendToBack')}
          </button>
        </div>
        {first === undefined && <p className="vc-phint">{t('fill.noDocument')}</p>}
      </Section>
    </div>
  );
}

function findNode(ctx: PanelContext, id: string): Node | null {
  return locateNode(ctx.space, id)?.node ?? null;
}
