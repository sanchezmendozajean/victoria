import { BarButton, BarSeparator, NumberField, Segmented } from '../components/controls';
import { Icon } from '../components/Icon';
import { t } from '../i18n';
import { useUi } from './store';
import type { ToolId } from './tools';
import { SHORTCUTS, formatAccelerator } from './shortcuts';
import './ControlBar.css';

const NODE_TOOLS: readonly ToolId[] = [
  'tool-pen',
  'tool-anchor-add',
  'tool-anchor-delete',
  'tool-anchor-convert',
  'tool-curvature',
  'tool-direct-select',
];

/**
 * Contextual bar (specs/10 §2). Phase 1 has no selection, so it shows the "anchor" layout of mockup
 * screen 3 for the node tools and just the tool name for the rest. The values are mockup placeholders.
 */
export function ControlBar() {
  const activeTool = useUi((s) => s.activeTool);
  const os = useUi((s) => s.platform.os);
  const joinKeys = formatAccelerator(SHORTCUTS['object.join'], os);

  return (
    <div className="vc-controlbar" data-testid="control-bar">
      {NODE_TOOLS.includes(activeTool) ? (
        <>
          <div className="vc-controlbar__title">
            <Icon id="tool-pen" size={16} />
            <span>{t('control.anchorSelected')}</span>
          </div>
          <BarSeparator />
          <span className="vc-controlbar__muted">{t('control.convert')}</span>
          <Segmented
            items={[
              { icon: 'tool-anchor-convert', tooltip: t('control.convertCorner') },
              { icon: 'tool-curvature', tooltip: t('control.convertSmooth'), active: true },
            ]}
          />
          <span className="vc-controlbar__muted vc-controlbar__muted--gap">{t('control.handles')}</span>
          <Segmented
            items={[
              { icon: 'visibility', tooltip: t('control.handlesShow'), active: true },
              { icon: 'visibility-off', tooltip: t('control.handlesHide') },
            ]}
          />
          <BarSeparator />
          <BarButton icon="tool-anchor-delete" label={t('control.deleteAnchor')} tooltip={t('control.deleteAnchorTip')} />
          <BarButton icon="tool-scissors" label={t('control.cutAtAnchor')} tooltip={t('control.cutAtAnchorTip')} />
          <BarButton icon="join" label={t('control.join')} tooltip={t('control.joinTip')} shortcut={joinKeys} />
          <BarSeparator />
          <NumberField icon="round-corners" value="0" unit="pt" width={84} tooltip={t('control.cornerRadius')} />
          <BarSeparator />
          <span className="vc-controlbar__muted">{t('control.anchor')}</span>
          <NumberField label="X" value="19" unit="pt" width={78} />
          <NumberField label="Y" value="20" unit="pt" width={78} />
        </>
      ) : (
        <div className="vc-controlbar__title">
          <Icon id={activeTool} size={16} />
          <span>{t(`tool.${activeTool}`)}</span>
        </div>
      )}
      <div className="vc-controlbar__spacer" />
      <BarButton icon="panel-menu" tooltip={t('control.menu')} />
    </div>
  );
}
