import type { TextStyle } from '../../core';
import { applyCharacter, characterField, selectedTextIds, type Field } from '../app/textActions';
import { useUi } from '../app/store';
import type { IconId } from '../components/Icon';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { tip } from '../components/Tooltip';
import { t, type TranslationKey } from '../i18n';
import { fontManager } from '../text/fontManager';
import { FontPicker } from './FontPicker';
import { Choice, Row, Section } from './kit';
import { usePanelContext } from './context';

const LANGUAGES = ['es', 'en', 'fr', 'de', 'pt', 'it', 'ca'] as const;

const value = <T,>(f: Field<T>): T | null => (f.mixed ? null : (f.value ?? null));

type ToggleKey = 'caps' | 'smallCaps' | 'superscript' | 'subscript' | 'underline' | 'strikethrough';
const TOGGLES: ReadonlyArray<{ key: ToggleKey; icon: IconId; tip: TranslationKey }> = [
  { key: 'caps', icon: 'all-caps', tip: 'text.caps' },
  { key: 'smallCaps', icon: 'small-caps', tip: 'text.smallCaps' },
  { key: 'superscript', icon: 'superscript', tip: 'text.superscript' },
  { key: 'subscript', icon: 'subscript', tip: 'text.subscript' },
  { key: 'underline', icon: 'underline', tip: 'text.underline' },
  { key: 'strikethrough', icon: 'strikethrough', tip: 'text.strikethrough' },
];

/** Carácter (specs/07): font, style, size, leading, kerning, tracking, scales, baseline shift, rotation, caps and lines. */
export function CharacterPanel() {
  const ctx = usePanelContext();
  // Re-render when the editing range, the defaults or the pending style change.
  useUi((s) => s.textEditing);
  useUi((s) => s.textStyle);
  useUi((s) => s.pendingTextStyle);
  if (!ctx) return <div className="vc-pempty">{t('fill.noDocument')}</div>;

  const family = characterField('fontFamily');
  const style = characterField('fontStyle');
  const size = characterField('size');
  const leading = characterField('leading');
  const kerning = characterField('kerning');
  const tracking = characterField('tracking');
  const hScale = characterField('hScale');
  const vScale = characterField('vScale');
  const shift = characterField('baselineShift');
  const rotation = characterField('charRotation');
  const language = characterField('language');

  const familyName = value(family);
  const styles = familyName ? fontManager.stylesOf(familyName) : [];
  const currentStyle = value(style);
  const styleOptions = [...new Set([...styles, ...(currentStyle && !styles.includes(currentStyle) ? [currentStyle] : [])])].map((s) => ({ id: s, label: s }));
  const kerningValue = value(kerning);
  const kerningMode = kerning.mixed ? null : kerningValue === undefined || kerningValue === null || kerningValue === 'auto' ? 'auto' : kerningValue === 'none' ? 'none' : 'custom';
  const sizeNumber = value(size);
  const num = (f: Field<number>, fallback: number): number | null => (f.mixed ? null : (f.value ?? fallback));
  const set = (patch: Partial<TextStyle>) => applyCharacter(patch);
  const hasTarget = selectedTextIds().length > 0 || useUi.getState().textEditing !== null;

  return (
    <div className="vc-panelbody" data-testid="character-panel">
      {!hasTarget && <p className="vc-phint">{t('text.noText')}</p>}
      <Section title={t('text.characterSection')}>
        <Row>
          <FontPicker
            family={familyName}
            mixed={family.mixed}
            onPick={(name) => {
              const first = fontManager.stylesOf(name);
              const keep = currentStyle && first.includes(currentStyle) ? currentStyle : (first.find((s) => /^(regular|normal|book|roman)$/i.test(s)) ?? first[0] ?? 'Regular');
              set({ fontFamily: name, fontStyle: keep });
            }}
          />
        </Row>
        <Row>
          <Choice label={t('text.fontStyle')} value={currentStyle} mixed={style.mixed} options={styleOptions} onChange={(s) => set({ fontStyle: s })} testId="font-style" />
        </Row>
        <Row>
          <NumberInput icon="tool-type" tooltip={t('text.size')} value={sizeNumber} suffix="pt" min={0.1} max={1296} decimals={2} step={1} width={96} testId="char-size" onCommit={(v) => set({ size: v })} />
          <NumberInput
            icon="leading"
            tooltip={t('text.leading')}
            value={leading.mixed ? null : (leading.value ?? (sizeNumber ?? 12) * 1.2)}
            suffix="pt"
            min={0.1}
            decimals={2}
            step={1}
            width={96}
            testId="char-leading"
            onCommit={(v) => set({ leading: v })}
          />
          <button type="button" className="vc-pbutton vc-pbutton--icon" data-testid="char-leading-auto" aria-pressed={!leading.mixed && leading.value === undefined} {...tip(t('text.leadingAuto'))} onClick={() => set({ leading: undefined })}>
            <Icon id="undo" size={14} />
          </button>
        </Row>
        <Row>
          <Choice icon="kerning" label={t('text.kerning')} value={kerningMode} mixed={kerning.mixed} testId="char-kerning-mode" width={110} onChange={(mode) => set({ kerning: mode === 'auto' ? undefined : mode === 'none' ? 'none' : 0 })}
            options={[{ id: 'auto', label: t('text.kerningAuto') }, { id: 'none', label: t('text.kerningNone') }, { id: 'custom', label: t('text.kerningCustom') }]} />
          <NumberInput tooltip={t('text.kerning')} value={kerningMode === 'custom' ? (kerningValue as number) : null} disabled={kerningMode !== 'custom'} decimals={0} step={10} width={78} testId="char-kerning" onCommit={(v) => set({ kerning: v })} />
        </Row>
        <Row>
          <NumberInput icon="tracking" tooltip={t('text.tracking')} value={num(tracking, 0)} decimals={0} step={10} width={96} testId="char-tracking" onCommit={(v) => set({ tracking: v })} />
          <NumberInput icon="baseline-shift" tooltip={t('text.baselineShift')} value={num(shift, 0)} suffix="pt" decimals={2} step={1} width={96} testId="char-shift" onCommit={(v) => set({ baselineShift: v })} />
        </Row>
        <Row>
          <NumberInput label="H" tooltip={t('text.hScale')} value={num(hScale, 100)} suffix="%" min={1} max={1000} decimals={1} step={1} width={96} testId="char-hscale" onCommit={(v) => set({ hScale: v })} />
          <NumberInput label="V" tooltip={t('text.vScale')} value={num(vScale, 100)} suffix="%" min={1} max={1000} decimals={1} step={1} width={96} testId="char-vscale" onCommit={(v) => set({ vScale: v })} />
        </Row>
        <Row>
          <NumberInput icon="char-rotate" tooltip={t('text.charRotation')} value={num(rotation, 0)} suffix="°" decimals={1} step={1} width={96} testId="char-rotation" onCommit={(v) => set({ charRotation: v })} />
          <Choice
            label={t('text.language')}
            value={value(language) ?? 'es'}
            mixed={language.mixed}
            testId="char-language"
            width={110}
            onChange={(l) => set({ language: l })}
            options={LANGUAGES.map((l) => ({ id: l, label: t(`text.lang.${l}` as TranslationKey) }))}
          />
        </Row>
      </Section>
      <Section title={t('text.styleSection')}>
        <Row>
          {TOGGLES.map((toggle) => {
            const field = characterField(toggle.key);
            const on = !field.mixed && field.value === true;
            return (
              <button
                key={toggle.key}
                type="button"
                className={`vc-pbutton vc-pbutton--icon${on ? ' is-active' : ''}`}
                aria-pressed={on}
                data-testid={`char-${toggle.key}`}
                {...tip(t(toggle.tip))}
                onClick={() => {
                  // Superscript and subscript exclude each other, as do caps and small caps.
                  const patch: Partial<TextStyle> = { [toggle.key]: on ? undefined : true };
                  if (!on && toggle.key === 'superscript') patch.subscript = undefined;
                  if (!on && toggle.key === 'subscript') patch.superscript = undefined;
                  if (!on && toggle.key === 'caps') patch.smallCaps = undefined;
                  if (!on && toggle.key === 'smallCaps') patch.caps = undefined;
                  set(patch);
                }}
              >
                <Icon id={toggle.icon} size={16} />
              </button>
            );
          })}
        </Row>
      </Section>
    </div>
  );
}
