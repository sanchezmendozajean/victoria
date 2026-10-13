import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './evaluate';

const units = { pt: 1, px: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };
const mm = { units, defaultUnit: 'mm' };

describe('evaluateExpression', () => {
  it('adds, subtracts, multiplies and divides: 15 + 5 = 20 (Illustrator)', () => {
    expect(evaluateExpression('15 + 5')).toBe(20);
    expect(evaluateExpression('15 - 5')).toBe(10);
    expect(evaluateExpression('6 * 7')).toBe(42);
    expect(evaluateExpression('7 / 2')).toBe(3.5);
  });

  it('follows operator precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('2 * (3 + (4 - 1)) / 3')).toBe(4);
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512);
  });

  it('accepts a bare number, signs and spaces', () => {
    expect(evaluateExpression('42')).toBe(42);
    expect(evaluateExpression('  -7 ')).toBe(-7);
    expect(evaluateExpression('+7')).toBe(7);
    expect(evaluateExpression('3 - -2')).toBe(5);
    expect(evaluateExpression('--4')).toBe(4);
  });

  it('reads decimals with a point or a comma', () => {
    expect(evaluateExpression('1,5 + 2.5')).toBe(4);
    expect(evaluateExpression('.5 * 4')).toBe(2);
    expect(evaluateExpression('0,25')).toBe(0.25);
  });

  it('accepts the typographic operators × ÷ −', () => {
    expect(evaluateExpression('6 × 7')).toBe(42);
    expect(evaluateExpression('8 ÷ 2')).toBe(4);
    expect(evaluateExpression('9 − 4')).toBe(5);
  });

  it('converts units into the default unit', () => {
    expect(evaluateExpression('2 cm + 5 mm', mm)).toBeCloseTo(25, 9);
    expect(evaluateExpression('1 in', mm)).toBeCloseTo(25.4, 9);
    expect(evaluateExpression('1" + 10', mm)).toBeCloseTo(35.4, 9);
    expect(evaluateExpression('10 + 5', mm)).toBe(15); // bare numbers are already in the field unit
    expect(evaluateExpression('72 pt', { units, defaultUnit: 'in' })).toBeCloseTo(1, 9);
    expect(evaluateExpression('2 CM', mm)).toBeCloseTo(20, 9);
  });

  it('rejects unknown units, or units when none are available', () => {
    expect(evaluateExpression('5 parsecs', mm)).toBeNull();
    expect(evaluateExpression('5 mm')).toBeNull();
  });

  it('rejects invalid or incomplete expressions', () => {
    for (const bad of ['', '   ', '5 +', '* 5', '(2 + 3', '2 + 3)', '5 5', 'abc', '5 / 0', '2 $ 3', '()', '1..2.3', '5 mm mm']) {
      expect(evaluateExpression(bad, mm), bad).toBeNull();
    }
  });

  it('never executes code', () => {
    expect(evaluateExpression('process.exit(1)')).toBeNull();
    expect(evaluateExpression('alert(1)')).toBeNull();
    expect(evaluateExpression('constructor')).toBeNull();
  });

  it('rejects results that are not finite numbers', () => {
    expect(evaluateExpression('10 ^ 1000')).toBeNull();
  });
});
