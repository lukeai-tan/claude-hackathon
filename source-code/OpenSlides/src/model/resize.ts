import type { Deck, DeckSize, SlideElement } from './types';
import { scaleInlineFontSizes } from '../render/richtext';
import { uid } from './factory';

/**
 * Magic resize: re-fits every slide and layout to a new format.
 * Positions scale with each axis; sizes and type scale uniformly so nothing
 * distorts; full-bleed items stretch to the new edges.
 */
export function resizeDeck(deck: Deck, size: DeckSize, asCopy: boolean): Deck {
  const sx = size.w / deck.size.w;
  const sy = size.h / deck.size.h;
  const s = Math.min(sx, sy);
  // Type scales with the geometric mean so a wide-to-square resize doesn't shrink text as much as the boxes.
  const ts = Math.sqrt(sx * sy);

  const fitEl = <T extends SlideElement>(el: T): T => {
    const e = structuredClone(el) as T;
    const fullW = el.w >= deck.size.w * 0.95 && el.x <= deck.size.w * 0.03;
    const fullH = el.h >= deck.size.h * 0.95 && el.y <= deck.size.h * 0.03;
    const edgeR = Math.abs(el.x + el.w - deck.size.w) < deck.size.w * 0.02;
    const edgeB = Math.abs(el.y + el.h - deck.size.h) < deck.size.h * 0.02;
    const cx = (el.x + el.w / 2) * sx;
    const cy = (el.y + el.h / 2) * sy;
    let w = el.w * s;
    let h = el.h * s;
    if (fullW || (el.type === 'shape' && (el.x <= 1 || edgeR) && el.w > deck.size.w * 0.25)) w = el.w * sx;
    if (fullH || (el.type === 'shape' && (el.y <= 1 || edgeB) && el.h > deck.size.h * 0.25)) h = el.h * sy;
    if (el.type === 'image' && el.ph && (el.w > deck.size.w * 0.4 || el.h > deck.size.h * 0.4)) {
      w = el.w * sx;
      h = el.h * sy;
    }
    if (el.type === 'text') {
      // Text boxes follow the new column width and get the extra height.
      w = Math.min(el.w * sx, size.w * 0.92);
      // Narrower boxes wrap onto more lines; vertical space scales with the slide height, so give it all.
      h = el.h * sy;
    }
    e.w = w;
    e.h = h;
    e.x = cx - w / 2;
    e.y = cy - h / 2;
    // Keep things that hugged an edge on that edge.
    if (el.x <= 1) e.x = 0;
    if (el.y <= 1) e.y = 0;
    if (edgeR) e.x = size.w - w;
    if (edgeB) e.y = size.h - h;
    if (e.type === 'text' && el.type === 'text') {
      e.style.fontSize = Math.max(8, Math.round(el.style.fontSize * ts));
      e.html = scaleInlineFontSizes(el.html, ts);
      e.padding = Math.round(el.padding * s);
    }
    if (e.type === 'shape' && el.type === 'shape') {
      e.strokeWidth = Math.max(el.strokeWidth ? 1 : 0, Math.round(el.strokeWidth * s));
      e.radius = el.radius * s;
    }
    if (e.type === 'chart' && el.type === 'chart') e.fontSize = Math.max(8, Math.round(el.fontSize * ts));
    if (e.type === 'table' && el.type === 'table') e.style.fontSize = Math.max(8, Math.round(el.style.fontSize * ts));
    if (e.type === 'image' && el.type === 'image') e.radius = el.radius * s;
    return e;
  };

  const out = structuredClone(deck);
  out.size = size;
  out.layouts = deck.layouts.map((l) => ({ ...l, elements: l.elements.map(fitEl) }));
  out.slides = deck.slides.map((sl) => ({
    ...sl,
    elements: sl.elements.map((e) => {
      if (!e.ph?.geom) return fitEl(e);
      // Geometry comes from the (already resized) layout; only the type needs scaling.
      const c = structuredClone(e);
      if (c.type === 'text' && e.type === 'text') {
        c.html = scaleInlineFontSizes(e.html, ts);
        if (!e.ph.style) c.style.fontSize = Math.max(8, Math.round(e.style.fontSize * ts));
      }
      return c;
    }),
  }));
  if (asCopy) {
    out.id = uid();
    out.title = `${deck.title} (${size.preset})`;
    out.createdAt = Date.now();
  }
  out.updatedAt = Date.now();
  return out;
}
