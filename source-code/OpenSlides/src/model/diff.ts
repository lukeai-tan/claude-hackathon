import type { Deck, Slide, SlideElement } from './types';

export interface SlideDiff {
  id: string;
  status: 'added' | 'removed' | 'moved' | 'changed' | 'unchanged';
  fromIndex: number | null;
  toIndex: number | null;
  changes: string[];
}

export interface DeckDiff {
  titleChange: { from: string; to: string } | null;
  slides: SlideDiff[];
  summary: string;
  hasChanges: boolean;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const TYPE_LABEL: Record<string, string> = {
  text: 'Text', shape: 'Shape', image: 'Image', chart: 'Chart', table: 'Table',
};
const label = (type: string) => TYPE_LABEL[type] ?? type;

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max = 32): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function describeChange(prev: SlideElement, next: SlideElement): string {
  if (prev.type === 'text' && next.type === 'text') {
    const before = plainText(prev.html);
    const after = plainText(next.html);
    if (before !== after) return `Text changed: “${truncate(before)}” → “${truncate(after)}”`;
  }
  if (prev.type === 'table' && next.type === 'table' && !equal(prev.rows, next.rows)) {
    return 'Table contents changed';
  }
  if (prev.type === 'chart' && next.type === 'chart' && !equal(prev.data, next.data)) {
    return 'Chart data changed';
  }
  const moved = prev.x !== next.x || prev.y !== next.y || prev.w !== next.w || prev.h !== next.h;
  if (moved && equal({ ...prev, x: 0, y: 0, w: 0, h: 0 }, { ...next, x: 0, y: 0, w: 0, h: 0 })) {
    return `${label(next.type)} moved or resized`;
  }
  return `${label(next.type)} changed`;
}

function slideChanges(from: Slide, to: Slide): string[] {
  const changes: string[] = [];
  const fromEls = new Map(from.elements.map((e) => [e.id, e]));
  const toEls = new Map(to.elements.map((e) => [e.id, e]));
  for (const e of to.elements) if (!fromEls.has(e.id)) changes.push(`${label(e.type)} added`);
  for (const e of from.elements) if (!toEls.has(e.id)) changes.push(`${label(e.type)} removed`);
  for (const e of to.elements) {
    const prev = fromEls.get(e.id);
    if (prev && !equal(prev, e)) changes.push(describeChange(prev, e));
  }
  if ((from.notes || '') !== (to.notes || '')) changes.push('Notes changed');
  if (from.layoutId !== to.layoutId) changes.push('Layout changed');
  if (!equal(from.background, to.background)) changes.push('Background changed');
  if (from.transition !== to.transition) changes.push('Transition changed');
  if ((from.hidden ?? false) !== (to.hidden ?? false)) changes.push(to.hidden ? 'Slide hidden' : 'Slide shown');
  return changes;
}

/** Structural diff between two decks: what changed going from `from` to `to`. */
export function diffDecks(from: Deck, to: Deck): DeckDiff {
  const fromIndex = new Map(from.slides.map((s, i) => [s.id, i]));
  const toIndex = new Map(to.slides.map((s, i) => [s.id, i]));
  const fromById = new Map(from.slides.map((s) => [s.id, s]));
  const slides: SlideDiff[] = [];

  to.slides.forEach((slide, i) => {
    const prev = fromById.get(slide.id);
    if (!prev) {
      slides.push({ id: slide.id, status: 'added', fromIndex: null, toIndex: i, changes: ['Slide added'] });
      return;
    }
    const changes = slideChanges(prev, slide);
    const fi = fromIndex.get(slide.id)!;
    const status: SlideDiff['status'] = changes.length ? 'changed' : fi !== i ? 'moved' : 'unchanged';
    slides.push({ id: slide.id, status, fromIndex: fi, toIndex: i, changes });
  });
  for (const slide of from.slides) {
    if (!toIndex.has(slide.id)) {
      slides.push({ id: slide.id, status: 'removed', fromIndex: fromIndex.get(slide.id)!, toIndex: null, changes: ['Slide removed'] });
    }
  }

  const count = (s: SlideDiff['status']) => slides.filter((d) => d.status === s).length;
  const parts: string[] = [];
  for (const s of ['added', 'removed', 'changed', 'moved'] as const) {
    const n = count(s);
    if (n) parts.push(`${n} ${s}`);
  }
  const titleChange = from.title !== to.title ? { from: from.title, to: to.title } : null;
  const hasChanges = !!titleChange || slides.some((s) => s.status !== 'unchanged');
  const summary = !hasChanges ? 'No changes' : `${parts.join(', ')}${titleChange ? (parts.length ? '; ' : '') + 'title changed' : ''}`;
  return { titleChange, slides, summary, hasChanges };
}
