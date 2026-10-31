import type { SlideElement } from '../model/types';

export interface BuildInfo {
  step: number; // 0 = visible when the slide appears
  delay: number;
  duration: number;
}

/**
 * Turns per-element animation settings into click steps.
 * "On click" starts a new step; "with previous" starts alongside the previous
 * animation; "after previous" starts when it ends.
 */
export function buildPlan(elements: SlideElement[]): { plan: Map<string, BuildInfo>; steps: number } {
  const animated = elements
    .filter((e) => e.anim && e.anim.effect !== 'none')
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.anim!.order - b.e.anim!.order || a.i - b.i)
    .map((x) => x.e);
  const plan = new Map<string, BuildInfo>();
  let step = 0;
  let prevStart = 0;
  let prevEnd = 0;
  for (const e of animated) {
    const a = e.anim!;
    let start: number;
    if (a.trigger === 'click') {
      step += 1;
      start = a.delay;
    } else if (a.trigger === 'with-previous') {
      start = prevStart + a.delay;
    } else {
      start = prevEnd + a.delay;
    }
    prevStart = start;
    prevEnd = start + a.duration;
    plan.set(e.id, { step, delay: start, duration: a.duration });
  }
  return { plan, steps: step };
}
