import {describe, expect, it} from 'vitest';
import {approach, createFrameLoop, ease, needsAnotherFrame} from '../src/scene/loop';

describe('needsAnotherFrame', () => {
  it('sleeps only when nothing moved, nothing was forced and no fade runs', () => {
    expect(needsAnotherFrame({moved: 0, forced: false, fades: 0})).toBe(false);
    expect(needsAnotherFrame({moved: 0.001, forced: false, fades: 0})).toBe(true);
    expect(needsAnotherFrame({moved: 0, forced: true, fades: 0})).toBe(true);
    expect(needsAnotherFrame({moved: 0, forced: false, fades: 1})).toBe(true);
  });
});

describe('approach', () => {
  it('eases towards the target and lands on it inside eps, so easing ends', () => {
    expect(approach(0, 1, 10, 0.016, 1e-4)).toBeCloseTo(ease(0.016, 10), 10);
    expect(approach(0.99995, 1, 10, 0.016, 1e-4)).toBe(1);
  });

  it('reaches its target in a bounded number of frames, where a plain exponential never would', () => {
    let v = 0;
    let frames = 0;
    while (v !== 1 && frames < 10_000) {
      v = approach(v, 1, 4, 1 / 60, 1e-4);
      frames++;
    }
    expect(v).toBe(1);
    expect(frames).toBeLessThan(300);
  });
});

describe('createFrameLoop', () => {
  /** A fake requestAnimationFrame that the test fires by hand. */
  const fakeRaf = () => {
    const queue: ((n: number) => void)[] = [];
    return {schedule: (cb: (n: number) => void) => queue.push(cb), fire: () => queue.shift()?.(0), size: () => queue.length};
  };

  it('does not run until woken, and keeps going while the step asks for more', () => {
    const raf = fakeRaf();
    let left = 3;
    const loop = createFrameLoop(() => --left > 0, raf.schedule);
    expect(raf.size()).toBe(0);
    loop.wake();
    expect(loop.running()).toBe(true);
    raf.fire();
    raf.fire();
    expect(raf.size()).toBe(1);
    raf.fire();
    expect(left).toBe(0);
  });

  it('schedules nothing once the step says the picture is final, and restarts on the next wake', () => {
    const raf = fakeRaf();
    let steps = 0;
    const loop = createFrameLoop(() => (steps++, false), raf.schedule);
    loop.wake();
    raf.fire();
    expect(raf.size()).toBe(0);
    expect(loop.running()).toBe(false);
    loop.wake();
    expect(raf.size()).toBe(1);
    raf.fire();
    expect(steps).toBe(2);
  });

  it('never queues two frames, however often it is woken or woken from inside the step', () => {
    const raf = fakeRaf();
    const loop = createFrameLoop(() => {
      loop.wake();
      return true;
    }, raf.schedule);
    loop.wake();
    loop.wake();
    loop.wake();
    expect(raf.size()).toBe(1);
    raf.fire();
    expect(raf.size()).toBe(1);
  });
});
