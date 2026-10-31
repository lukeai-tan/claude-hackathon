import type { Background, Deck, Layout, Slide, SlideElement } from './types';

export function getLayout(deck: Deck, id: string): Layout {
  return deck.layouts.find((l) => l.id === id) ?? deck.layouts[deck.layouts.length - 1] ?? { id: 'blank', name: 'Blank', background: { kind: 'solid', color: 'theme:background' }, elements: [] };
}

export function slideBackground(deck: Deck, slide: Slide): Background {
  return slide.background ?? getLayout(deck, slide.layoutId).background;
}

/**
 * Applies master inheritance: a slide element linked to a layout placeholder
 * takes its geometry and/or text style from the layout until the user
 * overrides it on the slide.
 */
export function resolveElement(el: SlideElement, layout: Layout | undefined): SlideElement {
  if (!el.ph || !layout) return el;
  const src = layout.elements.find((l) => l.id === el.ph!.ref);
  if (!src) return el;
  let out: SlideElement = el;
  if (el.ph.geom) out = { ...out, x: src.x, y: src.y, w: src.w, h: src.h, rotation: src.rotation };
  if (el.ph.style && out.type === 'text' && src.type === 'text') {
    out = { ...out, style: src.style, fill: src.fill, padding: src.padding, autoHeight: src.autoHeight };
  }
  if (el.ph.style && out.type === 'image' && src.type === 'image') {
    out = { ...out, fit: src.fit, radius: src.radius };
  }
  return out;
}

export function resolvedElements(deck: Deck, slide: Slide): SlideElement[] {
  const layout = getLayout(deck, slide.layoutId);
  return slide.elements.map((e) => resolveElement(e, layout));
}

export function placeholderPrompt(deck: Deck, slide: Slide | null, el: SlideElement): string | undefined {
  if (el.prompt) return el.prompt;
  if (!slide || !el.ph) return undefined;
  const layout = getLayout(deck, slide.layoutId);
  return layout.elements.find((l) => l.id === el.ph!.ref)?.prompt;
}

export function placeholderKind(deck: Deck, slide: Slide | null, el: SlideElement) {
  if (el.placeholder) return el.placeholder;
  if (!slide || !el.ph) return undefined;
  return getLayout(deck, slide.layoutId).elements.find((l) => l.id === el.ph!.ref)?.placeholder;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  const div = document.createElement('template');
  div.innerHTML = html.replace(/<\/(p|li|div)>/gi, '\n</$1>').replace(/<br\s*\/?>/gi, '\n');
  return (div.content.textContent ?? '').replace(/\n{2,}/g, '\n').trim();
}

export function isEmptyHtml(html: string): boolean {
  return htmlToText(html).length === 0;
}

export interface TokenContext {
  n: number;
  total: number;
  title: string;
}

export function applyTokens(html: string, ctx: TokenContext): string {
  if (!html.includes('{{')) return html;
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return html
    .replace(/\{\{n\}\}/g, String(ctx.n))
    .replace(/\{\{total\}\}/g, String(ctx.total))
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{title\}\}/g, ctx.title.replace(/</g, '&lt;'));
}

export function slideTitle(deck: Deck, slide: Slide): string {
  for (const el of slide.elements) {
    if (el.type !== 'text') continue;
    const kind = placeholderKind(deck, slide, el);
    if (kind === 'title' || kind === 'number') {
      const t = htmlToText(el.html);
      if (t) return t.split('\n')[0];
    }
  }
  const firstText = slide.elements.find((e) => e.type === 'text' && htmlToText((e as any).html));
  return firstText && firstText.type === 'text' ? htmlToText(firstText.html).split('\n')[0] : '';
}

// ---------- geometry ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounding box of a possibly rotated element. */
export function aabb(el: Box & { rotation: number }): Box {
  if (!el.rotation) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const r = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const w = el.w * cos + el.h * sin;
  const h = el.w * sin + el.h * cos;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
