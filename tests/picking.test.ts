import {describe, expect, it} from 'vitest';
import {blendVelocity, dragPan, toNdc, wheelDelta, wheelPan} from '../src/scene/picking';

describe('gesture maths', () => {
  it('drags the wall with the finger: dragging right moves the camera left, scaled to the view', () => {
    expect(dragPan(100, 10, 0.35, 700)).toBeLessThan(0);
    expect(dragPan(-50, 10, 0.35, 700)).toBeGreaterThan(0);
    // Proportional to the distance dragged.
    expect(dragPan(200, 10, 0.35, 700)).toBeCloseTo(2 * dragPan(100, 10, 0.35, 700), 10);
    // Further away, a pixel is more world.
    expect(Math.abs(dragPan(10, 20, 0.35, 700))).toBeGreaterThan(Math.abs(dragPan(10, 10, 0.35, 700)));
  });

  it('smooths velocity, and a zero-length interval cannot divide by zero', () => {
    expect(blendVelocity(1, 0, 16)).toBeCloseTo(0.6, 10);
    expect(Number.isFinite(blendVelocity(0, 5, 0))).toBe(true);
    expect(blendVelocity(0, 5, 0)).toBe(blendVelocity(0, 5, 1));
  });

  it('takes the wheel axis that moved more', () => {
    expect(wheelDelta(30, 5)).toBe(30);
    expect(wheelDelta(2, -40)).toBe(-40);
    expect(wheelPan(100)).toBeGreaterThan(0);
    expect(wheelPan(-100)).toBe(-wheelPan(100));
  });

  it('converts a pointer position to normalised device coordinates with y up', () => {
    const rect = {left: 10, top: 20, width: 200, height: 100};
    expect(toNdc(110, 70, rect).map(Math.abs)).toEqual([0, 0]);
    expect(toNdc(10, 20, rect)).toEqual([-1, 1]);
    expect(toNdc(210, 120, rect)).toEqual([1, -1]);
  });
});
});
