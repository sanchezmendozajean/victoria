import {
  ARROWS,
  ARROW_IDS,
  arrowheadAt,
  commonStrokeField,
  primaryItem,
  PROFILE_IDS,
  WIDTH_PROFILES,
  sameNumbers,
  type Mixed,
  type StrokeStyle,
  type Vec2,
} from '../../core';
import { applyStroke } from '../app/paintActions';
import { useUi } from '../app/store';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t, type TranslationKey } from '../i18n';
import { CheckRow, Choice, IconChoice, Row, Section } from './kit';
import { usePanelContext } from './context';

const WEIGHTS = [0.25, 0.5, 0.75, 1, 2, 3, 5, 10, 25, 50, 100];
const mixedOf = <T,>(value: T): Mixed<T> => ({ mixed: false, value });

/** Trazo (specs/06): weight, caps, joins, miter, alignment, dashes, arrowheads and width profile. */
export function StrokePanel() {
  const ctx = usePanelContext();
  const newLook = useUi((s) => s.newLook);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;

  const fromLook = primaryItem(newLook, 'stroke');
  const looked = fromLook && fromLook.kind === 'stroke' ? fromLook.stroke : undefined;
  const field = <K extends keyof StrokeStyle>(name: K, equal?: (a: StrokeStyle[K], b: StrokeStyle[K]) => boolean): Mixed<StrokeStyle[K]> | null => {
    if (ctx.leaves.length > 0) return commonStrokeField(ctx.leaves, name, equal);
    return looked ? mixedOf(looked[name]) : null;
  };
  const value = <T,>(f: Mixed<T> | null): T | null => (f && !f.mixed ? f.value : null);

  const width = field('width');
  const cap = field('cap');
  const join = field('join');
  const miter = field('miterLimit');
  const align = field('align');
  const dash = field('dash', sameNumbers);
  const dashCorners = field('dashAlignToCorners');
  const startArrow = field('startArrow');
  const endArrow = field('endArrow');
  const arrowScale = field('arrowScale', (a, b) => a[0] === b[0] && a[1] === b[1]);
  const arrowAlign = field('arrowAlign');
  const profile = field('profile');
  const flip = field('profileFlip');

  const dashValues = value(dash);
  const dashed = !!dashValues && dashValues.length > 0;
  const scale = value(arrowScale);
  const weightNumber = value(width);
  const hasArrows = !!value(startArrow) || !!value(endArrow);

  const setDash = (index: number, v: number) => {
    const base = dashValues && dashValues.length > 0 ? [...dashValues] : [12, 12];
    while (base.length <= index) base.push(base[base.length - 1] ?? 12);
    base[index] = v;
    applyStroke({ dash: base });
  };

  return (
    <div className="vc-panelbody" data-testid="stroke-panel">
      <Section title={t('stroke.weightSection')}>
        <Row>
          <NumberInput
            icon="stroke-weight"
            suffix="pt"
            value={width && !width.mixed ? Math.round(width.value * 1000) / 1000 : null}
            onCommit={(v) => applyStroke({ width: v })}
            min={0}
            step={0.5}
            decimals={3}
            width={90}
            testId="stroke-weight"
            tooltip={t('stroke.weight')}
          />
          <Choice
            value={weightNumber !== null && WEIGHTS.includes(weightNumber) ? weightNumber : null}
            mixed={weightNumber === null || !WEIGHTS.includes(weightNumber)}
            label={t('stroke.weightPresets')}
            testId="stroke-weight-presets"
            width={64}
            options={WEIGHTS.map((w) => ({ id: w, label: `${w}` }))}
            onChange={(w) => applyStroke({ width: Number(w) })}
          />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 64 }}>{t('stroke.caps')}</span>
          <IconChoice
            testId="stroke-caps"
            value={value(cap)}
            options={[
              { id: 'butt', icon: 'cap-butt', tooltip: t('stroke.capButt') },
              { id: 'round', icon: 'cap-round', tooltip: t('stroke.capRound') },
              { id: 'square', icon: 'cap-square', tooltip: t('stroke.capSquare') },
            ]}
            onChange={(v) => applyStroke({ cap: v })}
          />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 64 }}>{t('stroke.joins')}</span>
          <IconChoice
            testId="stroke-joins"
            value={value(join)}
            options={[
              { id: 'miter', icon: 'join-miter', tooltip: t('stroke.joinMiter') },
              { id: 'round', icon: 'join-round', tooltip: t('stroke.joinRound') },
              { id: 'bevel', icon: 'join-bevel', tooltip: t('stroke.joinBevel') },
            ]}
            onChange={(v) => applyStroke({ join: v })}
          />
          <span style={{ flex: 1 }} />
          <NumberInput value={value(miter)} onCommit={(v) => applyStroke({ miterLimit: v })} min={1} max={500} decimals={2} width={64} testId="stroke-miter" tooltip={t('stroke.miterLimit')} label="x" />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 64 }}>{t('stroke.align')}</span>
          <IconChoice
            testId="stroke-align"
            value={value(align)}
            options={[
              { id: 'center', icon: 'align-stroke-center', tooltip: t('stroke.alignCenter') },
              { id: 'inside', icon: 'align-stroke-inside', tooltip: t('stroke.alignInside') },
              { id: 'outside', icon: 'align-stroke-outside', tooltip: t('stroke.alignOutside') },
            ]}
            onChange={(v) => applyStroke({ align: v })}
          />
        </Row>
      </Section>

      <Section title={t('stroke.dashSection')}>
        <CheckRow checked={dashed} mixed={dash?.mixed} label={t('stroke.dashed')} testId="stroke-dashed" onChange={(on) => applyStroke({ dash: on ? [12, 12] : null })} />
        <div className="vc-dashgrid" data-testid="stroke-dash-fields">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="vc-dashgrid__cell">
              <NumberInput
                value={dashValues && dashValues.length > 0 ? (dashValues[i] ?? null) : null}
                onCommit={(v) => setDash(i, v)}
                min={0}
                decimals={2}
                width={54}
                disabled={!dashed}
                testId={`stroke-dash-${i}`}
                tooltip={t(i % 2 === 0 ? 'stroke.dash' : 'stroke.gap')}
              />
              <span className="vc-plabel">{t(i % 2 === 0 ? 'stroke.dash' : 'stroke.gap')}</span>
            </div>
          ))}
        </div>
        <CheckRow checked={!!value(dashCorners)} mixed={dashCorners?.mixed} label={t('stroke.dashAlign')} testId="stroke-dash-corners" disabled={!dashed} onChange={(on) => applyStroke({ dashAlignToCorners: on })} />
      </Section>

      <Section title={t('stroke.arrowSection')}>
        <Row>
          <Icon id="arrow-start" size={14} className="vc-field__icon" />
          <ArrowChoice value={value(startArrow) ?? ''} mixed={startArrow?.mixed} label={t('stroke.startArrow')} testId="stroke-arrow-start" onChange={(id) => applyStroke({ startArrow: id === '' ? undefined : id })} />
        </Row>
        <Row>
          <Icon id="arrow-end" size={14} className="vc-field__icon" />
          <ArrowChoice value={value(endArrow) ?? ''} mixed={endArrow?.mixed} label={t('stroke.endArrow')} testId="stroke-arrow-end" onChange={(id) => applyStroke({ endArrow: id === '' ? undefined : id })} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 64 }}>{t('stroke.arrowScale')}</span>
          <NumberInput label="↔" value={scale ? scale[0] : null} onCommit={(v) => applyStroke({ arrowScale: [v, scale ? scale[1] : 100] })} suffix="%" min={1} max={1000} decimals={0} width={72} disabled={!hasArrows} testId="stroke-arrow-scale-x" tooltip={t('stroke.arrowScale')} />
          <NumberInput label="↕" value={scale ? scale[1] : null} onCommit={(v) => applyStroke({ arrowScale: [scale ? scale[0] : 100, v] })} suffix="%" min={1} max={1000} decimals={0} width={72} disabled={!hasArrows} testId="stroke-arrow-scale-y" tooltip={t('stroke.arrowScale')} />
        </Row>
        <Row>
          <span className="vc-plabel" style={{ width: 64 }}>{t('stroke.arrowAlign')}</span>
          <IconChoice
            testId="stroke-arrow-align"
            value={arrowAlign && !arrowAlign.mixed ? (arrowAlign.value ?? 'inside') : null}
            options={[
              { id: 'extend', icon: 'arrow-end', tooltip: t('stroke.arrowExtend') },
              { id: 'inside', icon: 'align-stroke-inside', tooltip: t('stroke.arrowInside') },
            ]}
            onChange={(v) => applyStroke({ arrowAlign: v })}
          />
        </Row>
      </Section>

      <Section title={t('stroke.profileSection')}>
        <Row>
          <Icon id="width-profile" size={14} className="vc-field__icon" />
          <Choice
            value={profile && !profile.mixed ? (profile.value ?? 'uniform') : null}
            mixed={profile?.mixed}
            label={t('stroke.profile')}
            testId="stroke-profile"
            width={140}
            options={PROFILE_IDS.map((id) => ({ id, label: t((WIDTH_PROFILES[id] as { name: string }).name as TranslationKey) }))}
            onChange={(id) => applyStroke({ profile: id === 'uniform' ? undefined : id })}
          />
          <ProfileThumb id={profile && !profile.mixed ? (profile.value ?? 'uniform') : 'uniform'} />
          <button
            type="button"
            className="vc-pbutton vc-pbutton--icon"
            data-testid="stroke-profile-flip"
            aria-pressed={!!value(flip)}
            {...tip(t('stroke.flipProfile'))}
            onClick={() => applyStroke({ profileFlip: !value(flip) })}
            style={value(flip) ? { background: 'var(--bg-active)' } : undefined}
          >
            <Icon id="flip-profile" size={16} />
          </button>
        </Row>
      </Section>
    </div>
  );
}

/** Miniature of an arrowhead on a short line (the catalogue thumbnails of the spec). */
function ArrowThumb({ id }: { id: string }) {
  const head = id
    ? arrowheadAt(
        { anchors: [{ p: { x: 0, y: 0 }, in: null, out: null, kind: 'corner' }, { p: { x: 22, y: 0 }, in: null, out: null, kind: 'corner' }], closed: false },
        { width: 1.2, cap: 'butt', join: 'miter', miterLimit: 10, align: 'center', dash: null, dashAlignToCorners: false, arrowScale: [100, 100], endArrow: id },
        'end',
      )
    : null;
  const path = (pts: Vec2[], close: boolean) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + 3).toFixed(2)} ${(p.y + 6).toFixed(2)}`).join(' ') + (close ? 'Z' : '');
  return (
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" className="vc-thumb">
      <path d="M3 6h17" stroke="currentColor" strokeWidth="1.2" />
      {head?.fills.map((poly, i) => <path key={`f${i}`} d={path(poly, true)} fill="currentColor" />)}
      {head?.lines.map((line, i) => <path key={`l${i}`} d={path(line, false)} fill="none" stroke="currentColor" strokeWidth="1.2" />)}
    </svg>
  );
}

function ArrowChoice({ value, mixed, label, testId, onChange }: { value: string; mixed?: boolean; label: string; testId: string; onChange(id: string): void }) {
  return (
    <>
      <Choice
        value={value}
        mixed={mixed}
        label={label}
        testId={testId}
        width={130}
        options={[{ id: '', label: t('stroke.arrowNone') }, ...ARROW_IDS.map((id) => ({ id, label: t((ARROWS[id] as { name: string }).name as TranslationKey) }))]}
        onChange={(v) => onChange(String(v))}
      />
      <ArrowThumb id={value} />
    </>
  );
}

function ProfileThumb({ id }: { id: string }) {
  const profile = WIDTH_PROFILES[id] ?? WIDTH_PROFILES.uniform!;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = 2 + (i / 16) * 26;
    const h = (profile.at(i / 16) * 8) / 2;
    top.push(`${x.toFixed(1)} ${(6 - h).toFixed(1)}`);
    bottom.unshift(`${x.toFixed(1)} ${(6 + h).toFixed(1)}`);
  }
  return (
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" className="vc-thumb">
      <path d={`M${top.join(' L')} L${bottom.join(' L')} Z`} fill="currentColor" />
    </svg>
  );
}
