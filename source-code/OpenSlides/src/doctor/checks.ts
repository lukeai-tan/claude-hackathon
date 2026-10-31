import { useEffect, useState } from 'react';
import { useEditor } from '../store/editor';
import type { Deck, Slide, SlideElement, TextElement } from '../model/types';
import { aabb, getLayout, htmlToText, placeholderKind, resolveElement, slideBackground } from '../model/resolve';
import { backgroundColor, contrastRatio, resolveColor, resolveFont, toHex } from '../model/theme';

export type Severity = 'error' | 'warning' | 'tip';
export type FixKind = 'offslide' | 'alt' | 'contrast' | 'none';

export interface Issue {
  key: string;
  slideId: string;
  slideIndex: number;
  elementId?: string;
  severity: Severity;
  message: string;
  fix: FixKind;
}

/** Converts slide pixels to the point size the text will have in PowerPoint (13.33in wide slide). */
export function pxToPt(px: number, deck: Deck): number {
  return (px * 960) / deck.size.w;
}

/** The colour actually behind a text box: its own fill, a shape under it, or the slide background. */
export function colorBehind(deck: Deck, slide: Slide, els: SlideElement[], text: TextElement): string | null {
  const own = resolveColor(text.fill, deck.theme);
  if (text.fill !== 'transparent' && toHex(own)) return toHex(own);
  const idx = els.findIndex((e) => e.id === text.id);
  const cx = text.x + text.w / 2;
  const cy = text.y + text.h / 2;
  for (let i = idx - 1; i >= 0; i--) {
    const e = els[i];
    const b = aabb(e);
    if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
    if (e.type === 'shape' && e.fill !== 'transparent' && e.shape !== 'line' && e.shape !== 'arrow' && e.opacity > 0.6) return toHex(resolveColor(e.fill, deck.theme));
    if (e.type === 'image' && e.assetId) return null; // unknown: text over a photo
    if (e.type === 'text' && e.fill !== 'transparent') return toHex(resolveColor(e.fill, deck.theme));
  }
  const layout = getLayout(deck, slide.layoutId);
  for (let i = layout.elements.length - 1; i >= 0; i--) {
    const e = layout.elements[i];
    if (e.placeholder || e.type !== 'shape' || e.fill === 'transparent') continue;
    const b = aabb(e);
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return toHex(resolveColor(e.fill, deck.theme));
  }
  return backgroundColor(slideBackground(deck, slide), deck.theme);
}

export function runChecks(deck: Deck): Issue[] {
  const issues: Issue[] = [];
  const fonts = new Set<string>();
  deck.slides.forEach((slide, si) => {
    const layout = getLayout(deck, slide.layoutId);
    const els = slide.elements.map((e) => resolveElement(e, layout));
    const add = (severity: Severity, message: string, elementId?: string, fix: FixKind = 'none') =>
      issues.push({ key: `${slide.id}-${elementId ?? 's'}-${issues.length}`, slideId: slide.id, slideIndex: si, elementId, severity, message, fix });
    let words = 0;
    let hasTitle = false;
    let titlePlaceholder = false;
    for (const el of els) {
      const b = aabb(el);
      const outX = Math.max(0, -b.x) + Math.max(0, b.x + b.w - deck.size.w);
      const outY = Math.max(0, -b.y) + Math.max(0, b.y + b.h - deck.size.h);
      const visibleFrac = Math.max(0, (b.w - outX) / b.w) * Math.max(0, (b.h - outY) / b.h);
      if (visibleFrac < 0.85 && !(el.type === 'image' && el.ph)) add('warning', `${label(el)} runs off the edge of the slide.`, el.id, 'offslide');

      if (el.type === 'text') {
        const kind = placeholderKind(deck, slide, el);
        const text = htmlToText(el.html);
        if (kind === 'title' || kind === 'number') {
          titlePlaceholder = true;
          if (text) hasTitle = true;
        }
        if (!text) continue;
        words += text.split(/\s+/).filter(Boolean).length;
        fonts.add(resolveFont(el.style.fontFamily, deck.theme));
        const pt = pxToPt(el.style.fontSize, deck);
        if (pt < 12) add('warning', `Text at ${Math.round(pt)} pt will be hard to read when projected. Aim for 18 pt or more.`, el.id);
        const fg = toHex(resolveColor(el.style.color, deck.theme));
        const bg = colorBehind(deck, slide, els, el);
        if (fg && bg) {
          const ratio = contrastRatio(fg, bg);
          const large = pt >= 18 || (el.style.bold && pt >= 14);
          const need = large ? 3 : 4.5;
          if (ratio < need) add(ratio < need * 0.7 ? 'error' : 'warning', `Low contrast (${ratio.toFixed(1)}:1, needs ${need}:1). Some people won’t be able to read this text.`, el.id, 'contrast');
        }
      }
      if (el.type === 'image' && el.assetId && el.assetId !== 'theme:logo' && !el.alt?.trim()) add('warning', 'Image has no alt text for screen readers.', el.id, 'alt');
      if (el.type === 'chart' && !el.title.trim() && !el.alt?.trim()) add('tip', 'Chart has no title or alt text, so its point isn’t stated.', el.id, 'alt');
      if (el.type === 'chart') {
        const n = el.data.labels.length;
        if (el.data.series.some((s) => s.values.length < n || s.values.some((v) => typeof v !== 'number' || Number.isNaN(v)))) add('warning', 'Chart data has empty or non-numeric cells; they plot as zero.', el.id);
      }
    }
    if (words > 90) add('warning', `${words} words on one slide. Consider splitting it or moving detail into the speaker notes.`);
    if (titlePlaceholder && !hasTitle && !slide.hidden) add('tip', 'Slide has an empty title. Titles help the audience and appear in the outline.');
  });
  if (fonts.size > 3) {
    issues.push({ key: 'fonts', slideId: deck.slides[0]?.id ?? '', slideIndex: 0, severity: 'tip', message: `The deck uses ${fonts.size} fonts (${[...fonts].join(', ')}). Two or three usually look more consistent.`, fix: 'none' });
  }
  const order: Record<Severity, number> = { error: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => a.slideIndex - b.slideIndex || order[a.severity] - order[b.severity]);
}

function label(el: SlideElement) {
  return { text: 'A text box', shape: 'A shape', image: 'An image', chart: 'A chart', table: 'A table' }[el.type];
}

// ---------- shared, debounced access for the toolbar badges ----------


let cache: { deck: Deck | null; issues: Issue[] } = { deck: null, issues: [] };

export function runChecksCached(deck: Deck): Issue[] {
  if (cache.deck !== deck) cache = { deck, issues: runChecks(deck) };
  return cache.issues;
}

/** Issues for the open deck, recomputed shortly after editing pauses (not on every drag frame). */
export function useIssues(): Issue[] {
  const deck = useEditor((s) => s.deck);
  const [issues, setIssues] = useState<Issue[]>(() => (deck ? runChecksCached(deck) : []));
  useEffect(() => {
    if (!deck) return;
    const t = setTimeout(() => setIssues(runChecksCached(deck)), 250);
    return () => clearTimeout(t);
  }, [deck]);
  return issues;
}
