import opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';
import { faceOf } from './fontManager';

describe('faceOf', () => {
  it('turns opentype.js glyphs into core outlines (command letter in `t`, font units, Y up)', () => {
    const path = new opentype.Path();
    path.moveTo(0, 0);
    path.lineTo(500, 0);
    path.quadraticCurveTo(600, 300, 500, 700);
    path.close();
    const font = new opentype.Font({
      familyName: 'Test',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      glyphs: [
        new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }),
        new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 700, path }),
      ],
    });
    const face = faceOf(font);
    const glyph = face.glyph('A');
    expect(face.has('A')).toBe(true);
    expect(glyph.advance).toBe(700);
    expect(glyph.commands.map((c) => c.t)).toEqual(['M', 'L', 'Q', 'Z']);
    expect(glyph.commands[2]).toMatchObject({ x1: 600, y1: 300, x: 500, y: 700 });
  });
});
