import { useMemo, useState } from 'react';
import { currentSlide, mutate, setToast, useEditor } from '../store/editor';
import { goToSlide } from '../store/actions';
import { bullets, escapeHtml, makeSlide } from '../model/factory';
import { getLayout, htmlToText, placeholderKind } from '../model/resolve';
import type { Deck, PlaceholderKind, Slide } from '../model/types';

interface Draft {
  layout: string;
  title: string;
  sub: string[];
  body: string[];
  body2: string[];
  notes: string[];
  col2: boolean;
  bulleted: boolean;
}

/** Parses a plain-text outline into slide drafts. Deterministic: same text, same slides. */
export function parseOutline(text: string): Draft[] {
  const out: Draft[] = [];
  let cur: Draft | null = null;
  const start = (layout: string, title: string) => {
    cur = { layout, title, sub: [], body: [], body2: [], notes: [], col2: false, bulleted: false };
    out.push(cur);
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^#\s+/.test(line)) {
      start(out.length === 0 ? 'title' : 'section', line.replace(/^#\s+/, ''));
      continue;
    }
    if (/^##\s+/.test(line)) {
      start('title-content', line.replace(/^##\s+/, ''));
      continue;
    }
    if (!cur) start('title-content', '');
    const c = cur as unknown as Draft;
    if (/^>\s?/.test(line)) {
      c.notes.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      c.col2 = true;
      if (c.layout === 'title-content') c.layout = 'two-content';
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/.test(line);
    const textLine = line.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim();
    if (c.layout === 'title' || c.layout === 'section') c.sub.push(textLine);
    else {
      (c.col2 ? c.body2 : c.body).push(textLine);
      if (bullet) c.bulleted = true;
    }
  }
  return out;
}

export function draftToSlide(deck: Deck, d: Draft): Slide {
  const layout = getLayout(deck, d.layout);
  const block = (lines: string[]) => (lines.length === 0 ? '' : d.bulleted ? bullets(lines) : lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(''));
  const content: Partial<Record<PlaceholderKind, string>> = {
    title: d.title ? `<p>${escapeHtml(d.title)}</p>` : '',
    subtitle: d.sub.map((l) => `<p>${escapeHtml(l)}</p>`).join(''),
    body: block(d.body),
    body2: block(d.body2),
  };
  const s = makeSlide(layout, content);
  s.notes = d.notes.join('\n');
  return s;
}

export function deckToOutline(deck: Deck): string {
  const lines: string[] = [];
  deck.slides.forEach((slide, i) => {
    const texts: Partial<Record<string, string>> = {};
    for (const el of slide.elements) {
      if (el.type !== 'text') continue;
      const k = placeholderKind(deck, slide, el) ?? 'other';
      texts[k] = (texts[k] ? texts[k] + '\n' : '') + htmlToText(el.html);
    }
    const title = (texts.title ?? texts.number ?? '').split('\n')[0];
    const layoutId = slide.layoutId;
    if (layoutId === 'title' || layoutId === 'section') lines.push(`# ${title}`);
    else lines.push(`## ${title}`);
    const sub = texts.subtitle ?? texts.caption;
    const body = [texts.body, texts.other].filter(Boolean).join('\n');
    if (sub) sub.split('\n').forEach((l) => l && lines.push(l));
    if (body) body.split('\n').forEach((l) => l && lines.push(`- ${l}`));
    if (texts.body2) {
      lines.push('---');
      texts.body2.split('\n').forEach((l) => l && lines.push(`- ${l}`));
    }
    if (slide.notes) slide.notes.split('\n').forEach((l) => l && lines.push(`> ${l}`));
    if (i < deck.slides.length - 1) lines.push('');
  });
  return lines.join('\n');
}

const EXAMPLE = `# Deck title
Subtitle line

## First point
- A bullet
- Another bullet
> Speaker note for this slide

## Compare two things
- Left column bullet
---
- Right column bullet

# A section header`;

export function OutlinePanel() {
  const deck = useEditor((s) => s.deck)!;
  const [text, setText] = useState('');
  const drafts = useMemo(() => parseOutline(text), [text]);

  const apply = (mode: 'replace' | 'insert') => {
    if (!drafts.length) return;
    if (mode === 'replace' && !confirm(`Replace all ${deck.slides.length} slides with ${drafts.length} slides from the outline? You can undo this.`)) return;
    const slides = drafts.map((d) => draftToSlide(deck, d));
    mutate((d) => {
      if (mode === 'replace') d.slides = slides as any;
      else {
        const cur = currentSlide();
        const idx = cur ? d.slides.findIndex((s) => s.id === cur.id) : d.slides.length - 1;
        d.slides.splice(idx + 1, 0, ...(slides as any));
      }
    });
    goToSlide(slides[0].id);
    setToast(`${slides.length} slide${slides.length === 1 ? '' : 's'} created from the outline`);
  };

  return (
    <div className="outline-panel">
      <p className="small">
        Write or paste an outline and turn it into slides. <code>#</code> title or section, <code>##</code> slide, <code>-</code> bullet, <code>---</code> second column, <code>&gt;</code> speaker note.
      </p>
      <div className="row-btns">
        <button className="btn small ghost" onClick={() => setText(deckToOutline(deck))}>
          Load this deck’s outline
        </button>
        <button className="btn small ghost" onClick={() => setText(EXAMPLE)}>
          Show an example
        </button>
      </div>
      <textarea className="outline-text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={EXAMPLE} spellCheck />
      <p className="muted small">{drafts.length ? `Creates ${drafts.length} slide${drafts.length === 1 ? '' : 's'} using this deck’s layouts and theme.` : 'Nothing to create yet.'}</p>
      <div className="row-btns">
        <button className="btn primary small" disabled={!drafts.length} onClick={() => apply('insert')}>
          Add after current slide
        </button>
        <button className="btn small" disabled={!drafts.length} onClick={() => apply('replace')}>
          Replace all slides
        </button>
      </div>
    </div>
  );
}
