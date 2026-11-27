/** Distance under which an easing value lands on its target, so the loop can sleep; far below a pixel. */
export const SETTLE_EPS = 1e-4;

/** Fraction of the remaining distance covered in `dt` seconds at easing rate `r` (frame-rate independent). */
export const ease = (dt: number, r: number): number => 1 - Math.exp(-dt * r);

/**
 * One easing step of `cur` towards `target`. Inside `eps` it lands on the target exactly: an exponential
 * ease never arrives, so without the snap the shelf would keep drawing for many seconds over an invisible gap.
 */
export function approach(cur: number, target: number, rate: number, dt: number, eps: number): number {
  const gap = target - cur;
  return Math.abs(gap) < eps ? target : cur + gap * ease(dt, rate);
}

/** What one frame found out about the scene. */
export interface FrameActivity {
  /** Sum of the changes this frame made (positions, camera, tints, glow): above 0 while anything is still easing. */
  moved: number;
  /** Something outside the loop changed what is on screen since the last draw. */
  forced: boolean;
  /** Cover cross-fades still running. */
  fades: number;
}

/** Whether the loop must run another frame. False means the picture is final and the loop may sleep. */
export const needsAnotherFrame = (a: FrameActivity): boolean => a.moved > 0 || a.forced || a.fades > 0;

export interface FrameLoop {
  /** Starts the loop if it is asleep. Safe to call from anywhere, any number of times. */
  wake(): void;
  /** True while a frame is scheduled. */
  running(): boolean;
}

/**
 * A requestAnimationFrame loop that sleeps. `step` runs once per frame and returns whether another frame is
 * needed; when it returns false nothing stays scheduled, and the next `wake()` starts it again.
 */
export function createFrameLoop(
  step: (now: number) => boolean,
  schedule: (cb: (now: number) => void) => number = (cb) => requestAnimationFrame(cb),
): FrameLoop {
  let pending = 0;
  const run = (now: number): void => {
    pending = 0;
    // A wake() during the step has already scheduled the next frame; do not schedule a second one.
    if (step(now) && !pending) pending = schedule(run);
  };
  return {
    wake() {
      if (!pending) pending = schedule(run);
    },
    running: () => pending !== 0,
  };
}
