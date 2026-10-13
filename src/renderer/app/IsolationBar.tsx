import { frameOf, getActiveSpace } from '../../core';
import { Icon } from '../components/Icon';
import { tip } from '../components/Tooltip';
import { useDocuments } from '../documents';
import { t } from '../i18n';
import { nodeLabel } from './nodeLabels';
import { useUi } from './store';
import './IsolationBar.css';

/** Grey bar of isolation mode: "Capa 1 › Grupo", with a way back (specs/03 · Selección › aislamiento). */
export function IsolationBar() {
  const documents = useDocuments();
  const session = documents.active?.session;
  const space = session ? getActiveSpace(session.document) : null;
  const id = useUi((s) => (space ? (s.isolation[space.id] ?? null) : null));
  const setIsolation = useUi((s) => s.setIsolation);
  const frame = space && id ? frameOf(space, id) : null;
  if (!space || !frame) return null;

  const parent = frame.ancestors[frame.ancestors.length - 1];
  const trail = [frame.layer.name, ...frame.ancestors.map(nodeLabel), nodeLabel(frame.node)];

  return (
    <div className="vc-isolation" data-testid="isolation-bar">
      <button type="button" className="vc-isolation__back" data-testid="isolation-exit" {...tip(t('isolation.exit'), 'Esc')} onClick={() => setIsolation(space.id, parent?.id ?? null)}>
        <Icon id="chevron-left" size={14} />
      </button>
      <span className="vc-isolation__trail">
        {trail.map((part, i) => (
          <span key={`${part}-${i}`} className={i === trail.length - 1 ? 'is-current' : undefined}>
            {i > 0 && <Icon id="chevron-right" size={10} />}
            {part}
          </span>
        ))}
      </span>
    </div>
  );
}
