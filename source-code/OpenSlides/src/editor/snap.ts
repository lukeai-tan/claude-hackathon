import type { Box } from '../model/resolve';
import type { Guide } from '../store/editor';

interface Target {
  pos: number;
  from: number;
  to: number;
}

function targets(axis: 'x' | 'y', others: Box[], W: number, H: number): Target[] {
  const t: Target[] = [];
  const span = axis === 'x' ? [0, H] : [0, W];
  const size = axis === 'x' ? W : H;
  t.push({ pos: 0, from: span[0], to: span[1] }, { pos: size / 2, from: span[0], to: span[1] }, { pos: size, from: span[0], to: span[1] });
  for (const o of others) {
    const [p, s, a, as] = axis === 'x' ? [o.x, o.w, o.y, o.h] : [o.y, o.h, o.x, o.w];
    for (const pos of [p, p + s / 2, p + s]) t.push({ pos, from: a, to: a + as });
  }
  return t;
}

function best(anchors: number[], ts: Target[], threshold: number) {
  let bestD = threshold + 1;
  let delta = 0;
  for (const a of anchors) {
    for (const t of ts) {
      const d = t.pos - a;
      if (Math.abs(d) < Math.abs(bestD) && Math.abs(d) <= threshold) {
        bestD = d;
        delta = d;
      }
    }
  }
  return bestD <= threshold ? delta : null;
}

function guidesFor(axis: 'x' | 'y', box: Box, ts: Target[]): Guide[] {
  const anchors = axis === 'x' ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];
  const [a, as] = axis === 'x' ? [box.y, box.h] : [box.x, box.w];
  const out: Guide[] = [];
  for (const anchor of anchors) {
    for (const t of ts) {
      if (Math.abs(t.pos - anchor) < 0.5) {
        out.push({ axis, pos: t.pos, from: Math.min(a, t.from), to: Math.max(a + as, t.to) });
      }
    }
  }
  return out;
}

/** Snaps a moving box to slide edges/centre and to other elements' edges/centres. */
export function snapBox(box: Box, others: Box[], W: number, H: number, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const tx = targets('x', others, W, H);
  const ty = targets('y', others, W, H);
  const dx = best([box.x, box.x + box.w / 2, box.x + box.w], tx, threshold) ?? 0;
  const dy = best([box.y, box.y + box.h / 2, box.y + box.h], ty, threshold) ?? 0;
  const snapped = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  return { dx, dy, guides: [...guidesFor('x', snapped, tx), ...guidesFor('y', snapped, ty)] };
}

/** Snaps a single moving edge coordinate. */
export function snapEdge(value: number, axis: 'x' | 'y', others: Box[], W: number, H: number, threshold: number): number | null {
  const ts = targets(axis, others, W, H);
  return best([value], ts, threshold);
}
