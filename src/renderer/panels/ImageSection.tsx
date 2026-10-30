import { LOW_PPI } from '../../core';
import {
  applySelectedCrop,
  cropSelectedImage,
  embedSelectedImage,
  imageFactsOf,
  relinkSelectedImage,
  removeSelectedCrop,
  setCropInsets,
  toggleCropMode,
  unembedSelectedImage,
} from '../app/imageObjectActions';
import { useUi } from '../app/store';
import { Icon } from '../components/Icon';
import { NumberInput } from '../components/NumberInput';
import { ptToUnit, unitToPt } from '../canvas/units';
import { t } from '../i18n';
import { Row, Section } from './kit';
import type { PanelContext } from './context';

const SIDES = ['left', 'top', 'right', 'bottom'] as const;

/** Imagen (specs/08): crop, resolution and link of the selected picture, or of the picture under a crop. */
export function ImageSection({ ctx, id }: { ctx: PanelContext; id: string }) {
  const cropMode = useUi((s) => s.cropMode);
  const facts = imageFactsOf(ctx.session, ctx.space, id);
  if (!facts) return null;
  const units = ctx.session.document.meta.units;
  const { image, crop, link } = facts;
  const ppi = Number.isFinite(facts.ppi) ? Math.round(facts.ppi) : null;
  const low = ppi !== null && ppi < LOW_PPI;
  // Image units → points on the page, so the fields speak the units of the document whatever the scale of the picture.
  const sx = Math.hypot(facts.world[0], facts.world[1]) || 1;
  const sy = Math.hypot(facts.world[2], facts.world[3]) || 1;
  const inset = (side: (typeof SIDES)[number]): number => {
    if (!crop) return 0;
    const { x, y, w, h } = crop.rect;
    return { left: x, top: y, right: image.width - x - w, bottom: image.height - y - h }[side];
  };
  const scale = (side: (typeof SIDES)[number]) => (side === 'left' || side === 'right' ? sx : sy);
  const name = image.linkedPath?.split(/[\\/]/).pop() ?? '';

  return (
    <Section title={t('image.section')}>
      <Row>
        <Icon id={low ? 'alert' : 'image'} size={14} className="vc-field__icon" />
        <span className="vc-plabel" data-testid="image-ppi" data-low={low ? 'true' : 'false'} style={low ? { color: 'var(--vc-danger, #d64545)' } : undefined}>
          {ppi === null ? '—' : t(low ? 'image.ppiLow' : 'image.ppi', { ppi })}
        </span>
      </Row>
      <Row>
        <Icon id={link === 'embedded' ? 'link' : 'unlink'} size={14} className="vc-field__icon" />
        <span className="vc-plabel" data-testid="image-link" data-state={link} title={image.linkedPath}>
          {link === 'embedded' ? t('image.embedded') : link === 'linked' ? t('image.linked', { name }) : t('image.broken', { name })}
        </span>
      </Row>
      <div className="vc-pgrid">
        <button type="button" className="vc-pbutton" data-testid="image-crop" aria-pressed={!!crop && cropMode === crop.clip.id} onClick={crop ? toggleCropMode : cropSelectedImage}>
          <Icon id="crop-image" size={14} />
          {crop ? t('image.cropEdit') : t('image.crop')}
        </button>
        <button type="button" className="vc-pbutton" data-testid="image-crop-apply" disabled={!crop || link === 'broken'} onClick={() => void applySelectedCrop()}>
          <Icon id="check" size={14} />
          {t('image.cropApply')}
        </button>
        <button type="button" className="vc-pbutton" data-testid="image-crop-remove" disabled={!crop} onClick={removeSelectedCrop}>
          <Icon id="undo" size={14} />
          {t('image.cropRemove')}
        </button>
        {link === 'embedded' ? (
          <button type="button" className="vc-pbutton" data-testid="image-unembed" onClick={() => void unembedSelectedImage()}>
            <Icon id="unlink" size={14} />
            {t('image.unembed')}
          </button>
        ) : (
          <button type="button" className="vc-pbutton" data-testid="image-embed" disabled={link === 'broken'} onClick={embedSelectedImage}>
            <Icon id="link" size={14} />
            {t('image.embed')}
          </button>
        )}
        <button type="button" className="vc-pbutton" data-testid="image-relink" disabled={link === 'embedded'} onClick={() => void relinkSelectedImage()}>
          <Icon id="folder" size={14} />
          {t('image.relink')}
        </button>
      </div>
      {crop &&
        SIDES.map((side) => (
          <Row key={side}>
            <span className="vc-plabel" style={{ width: 80 }}>{t(`image.inset.${side}`)}</span>
            <NumberInput
              value={ptToUnit(inset(side) * scale(side), units)}
              onCommit={(v) => setCropInsets({ [side]: unitToPt(v, units) / scale(side) })}
              suffix={units}
              lengthUnit={units}
              min={0}
              step={1}
              decimals={3}
              width={110}
              testId={`image-inset-${side}`}
              tooltip={t(`image.inset.${side}`)}
            />
          </Row>
        ))}
    </Section>
  );
}
