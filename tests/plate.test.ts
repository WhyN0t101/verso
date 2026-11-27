import {describe, expect, it} from 'vitest';
import {layoutPlate} from '../src/scene/plate';

const measure = (s: string, fs: number): number => s.length * fs * 0.5;

describe('layoutPlate', () => {
  it('keeps a short name on one line at full size', () => {
    expect(layoutPlate('Drama', 1000, 100, measure)).toEqual({lines: ['Drama'], fontSize: 62});
  });

  it('wraps a long name into two balanced lines instead of shrinking it to nothing', () => {
    const text = 'Adventure (continued), Young adult and Other (Classic, Historical fiction and 6 more)';
    const r = layoutPlate(text, 1000, 100, measure);
    expect(r.lines).toHaveLength(2);
    expect(r.lines.join(' ')).toBe(text);
    expect(r.fontSize).toBeGreaterThanOrEqual(30);
    for (const l of r.lines) expect(measure(l, r.fontSize)).toBeLessThanOrEqual(1000);
  });

  it('shrinks a single unbreakable word as a last resort, never below the floor', () => {
    const r = layoutPlate('Supercalifragilisticexpialidocious'.repeat(3), 400, 100, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.fontSize).toBeGreaterThanOrEqual(14);
  });
});
