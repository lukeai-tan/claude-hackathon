import { nanoid } from 'nanoid';
import type {
  ChartElement,
  ChartType,
  Deck,
  DeckSize,
  ImageElement,
  Layout,
  PlaceholderKind,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
  TextStyle,
  Theme,
} from './types';

export const uid = () => nanoid(10);

export const SIZE_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: '16:9', label: 'Widescreen 16:9', w: 1920, h: 1080 },
  { id: '4:3', label: 'Standard 4:3', w: 1440, h: 1080 },
  { id: 'a4', label: 'A4 landscape', w: 1754, h: 1240 },
  { id: '1:1', label: 'Square post 1:1', w: 1080, h: 1080 },
  { id: '4:5', label: 'Portrait post 4:5', w: 1080, h: 1350 },
  { id: '9:16', label: 'Story 9:16', w: 1080, h: 1920 },
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function paragraphs(text: string): string {
  return text
    .split('\n')
    .map((l) => `<p>${l ? escapeHtml(l) : '<br>'}</p>`)
    .join('');
}

export function bullets(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

export function defaultTextStyle(partial: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: 'theme:body',
    fontSize: 40,
    color: 'theme:text',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    valign: 'top',
    lineHeight: 1.25,
    letterSpacing: 0,
    ...partial,
  };
}

const base = (x: number, y: number, w: number, h: number) => ({
  id: uid(),
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
});

export function makeText(x: number, y: number, w: number, h: number, html: string, style: Partial<TextStyle> = {}, extra: Partial<TextElement> = {}): TextElement {
  return {
    ...base(x, y, w, h),
    type: 'text',
    html,
    style: defaultTextStyle(style),
    fill: 'transparent',
    padding: 8,
    autoHeight: true,
    ...extra,
  };
}

export function makeShape(shape: ShapeKind, x: number, y: number, w: number, h: number, extra: Partial<ShapeElement> = {}): ShapeElement {
  const isLine = shape === 'line' || shape === 'arrow';
  return {
    ...base(x, y, w, h),
    type: 'shape',
    shape,
    fill: isLine ? 'transparent' : 'theme:primary',
    stroke: isLine ? 'theme:text' : 'transparent',
    strokeWidth: isLine ? 6 : 0,
    radius: shape === 'roundRect' ? 32 : 0,
    ...extra,
  };
}

export function makeImage(assetId: string, x: number, y: number, w: number, h: number, extra: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base(x, y, w, h),
    type: 'image',
    assetId,
    fit: 'cover',
    radius: 0,
    filters: { brightness: 1, contrast: 1, saturate: 1, grayscale: 0 },
    ...extra,
  };
}

export function sampleChartData(type: ChartType) {
  if (type === 'pie' || type === 'doughnut') {
    return { labels: ['Design', 'Build', 'Test', 'Pitch'], series: [{ name: 'Hours', values: [3, 6, 2, 1] }] };
  }
  return {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: '2025', values: [12, 19, 24, 31] },
      { name: '2026', values: [18, 26, 33, 42] },
    ],
  };
}

export function makeChart(type: ChartType, x: number, y: number, w: number, h: number, extra: Partial<ChartElement> = {}): ChartElement {
  return {
    ...base(x, y, w, h),
    type: 'chart',
    chartType: type,
    data: sampleChartData(type),
    title: '',
    showLegend: true,
    showValues: false,
    showGrid: true,
    colors: [],
    fontFamily: 'theme:body',
    fontSize: 26,
    textColor: 'theme:text',
    ...extra,
  };
}

export function makeTable(rows: string[][], x: number, y: number, w: number, h: number, extra: Partial<TableElement> = {}): TableElement {
  return {
    ...base(x, y, w, h),
    type: 'table',
    rows,
    headerRow: true,
    style: {
      fontFamily: 'theme:body',
      fontSize: 28,
      color: 'theme:text',
      headerFill: 'theme:primary',
      headerColor: 'theme:background',
      borderColor: 'theme:surface',
      stripe: true,
      stripeFill: 'theme:surface',
      fill: 'transparent',
    },
    ...extra,
  };
}

// ---------- layouts (slide masters) ----------

export type LayoutVariant = 'minimal' | 'bar' | 'block';

function ph(kind: PlaceholderKind, prompt: string, el: SlideElement): SlideElement {
  el.placeholder = kind;
  el.prompt = prompt;
  return el;
}

export function makeLayouts(size: DeckSize, variant: LayoutVariant = 'bar'): Layout[] {
  const W = size.w;
  const H = size.h;
  const u = Math.min(W, H) / 1080;
  const portrait = H > W * 1.05;
  const m = Math.round(Math.min(W, H) * 0.08);
  const bg = { kind: 'solid' as const, color: 'theme:background' };
  const titleStyle = (fontSize: number, extra: Partial<TextStyle> = {}) =>
    ({ fontFamily: 'theme:heading', fontSize: Math.round(fontSize * u), color: 'theme:text', bold: true, lineHeight: 1.08, ...extra }) as Partial<TextStyle>;
  const bodyStyle = (fontSize: number, extra: Partial<TextStyle> = {}) =>
    ({ fontFamily: 'theme:body', fontSize: Math.round(fontSize * u), color: 'theme:text', lineHeight: 1.35, ...extra }) as Partial<TextStyle>;
  const fixed = { autoHeight: false };

  const footer = () =>
    makeText(W - m - 240 * u, H - m * 0.55 - 30 * u, 240 * u, 40 * u, '<p>{{n}}</p>', bodyStyle(22, { color: 'theme:muted', align: 'right' }), {
      name: 'Slide number',
      padding: 0,
      autoHeight: false,
    });
  const logo = () => makeImage('theme:logo', m, H - m * 0.55 - 44 * u, 160 * u, 44 * u, { fit: 'contain', name: 'Logo' });
  const decor = (): SlideElement[] => {
    if (variant === 'bar') return [makeShape('rect', m, m * 0.55, 96 * u, 10 * u, { fill: 'theme:accent', name: 'Accent bar' })];
    if (variant === 'block') return [makeShape('rect', 0, 0, 22 * u, H, { fill: 'theme:primary', name: 'Edge block' })];
    return [];
  };
  const titleY = m * 0.55 + 28 * u;
  const titleH = 150 * u;
  const contentY = titleY + titleH + 30 * u;
  const contentH = H - contentY - m - 20 * u;

  const titleSlide: Layout = {
    id: 'title',
    name: 'Title',
    background: bg,
    elements: [
      ...(variant === 'block' ? [makeShape('rect', portrait ? 0 : W * 0.68, portrait ? H * 0.72 : 0, portrait ? W : W * 0.32, portrait ? H * 0.28 : H, { fill: 'theme:primary', name: 'Colour block' })] : []),
      ...(variant === 'bar' ? [makeShape('rect', m, H * 0.36 - 40 * u, 140 * u, 14 * u, { fill: 'theme:accent', name: 'Accent bar' })] : []),
      ph('title', 'Click to add a title', makeText(m, H * 0.36, (variant === 'block' && !portrait ? W * 0.62 : W - 2 * m), 280 * u, '', titleStyle(portrait ? 104 : 116, { valign: 'top' }), fixed)),
      ph('subtitle', 'Click to add a subtitle', makeText(m, H * 0.36 + 300 * u, (variant === 'block' && !portrait ? W * 0.55 : W - 2 * m), 140 * u, '', bodyStyle(44, { color: 'theme:muted' }), fixed)),
      logo(),
    ],
  };

  const titleContent: Layout = {
    id: 'title-content',
    name: 'Title and content',
    background: bg,
    elements: [
      ...decor(),
      ph('title', 'Click to add a title', makeText(m, titleY, W - 2 * m, titleH, '', titleStyle(76, { valign: 'bottom' }), fixed)),
      ph('body', 'Click to add text', makeText(m, contentY, W - 2 * m, contentH, '', bodyStyle(40), fixed)),
      footer(),
      logo(),
    ],
  };

  const gap = 60 * u;
  const colW = portrait ? W - 2 * m : (W - 2 * m - gap) / 2;
  const twoContent: Layout = {
    id: 'two-content',
    name: 'Two columns',
    background: bg,
    elements: [
      ...decor(),
      ph('title', 'Click to add a title', makeText(m, titleY, W - 2 * m, titleH, '', titleStyle(76, { valign: 'bottom' }), fixed)),
      ph('body', 'Left column', makeText(m, contentY, colW, portrait ? contentH / 2 - gap / 2 : contentH, '', bodyStyle(36), fixed)),
      ph(
        'body2',
        'Right column',
        makeText(portrait ? m : m + colW + gap, portrait ? contentY + contentH / 2 + gap / 2 : contentY, colW, portrait ? contentH / 2 - gap / 2 : contentH, '', bodyStyle(36), fixed),
      ),
      footer(),
      logo(),
    ],
  };

  const section: Layout = {
    id: 'section',
    name: 'Section header',
    background: { kind: 'solid', color: 'theme:primary' },
    elements: [
      makeShape('rect', m, H * 0.42 - 40 * u, 140 * u, 14 * u, { fill: 'theme:accent', name: 'Accent bar' }),
      ph('title', 'Section title', makeText(m, H * 0.42, W - 2 * m, 220 * u, '', titleStyle(120, { color: 'theme:background' }), fixed)),
      ph('subtitle', 'Optional description', makeText(m, H * 0.42 + 240 * u, W - 2 * m, 120 * u, '', bodyStyle(40, { color: 'theme:background' }), fixed)),
    ],
  };

  const imgX = portrait ? 0 : W * 0.5;
  const imageRight: Layout = {
    id: 'image-right',
    name: 'Image and text',
    background: bg,
    elements: [
      ph('image', 'Drop an image here', makeImage('', imgX, 0, portrait ? W : W * 0.5, portrait ? H * 0.45 : H)),
      ph('title', 'Click to add a title', makeText(m, portrait ? H * 0.5 : titleY, portrait ? W - 2 * m : W * 0.5 - 1.5 * m, titleH, '', titleStyle(70, { valign: 'bottom' }), fixed)),
      ph('body', 'Click to add text', makeText(m, (portrait ? H * 0.5 : titleY) + titleH + 30 * u, portrait ? W - 2 * m : W * 0.5 - 1.5 * m, portrait ? H * 0.5 - titleH - m - 30 * u : contentH, '', bodyStyle(36), fixed)),
    ],
  };

  const bigNumber: Layout = {
    id: 'big-number',
    name: 'Big number',
    background: bg,
    elements: [
      ...decor(),
      ph('number', '42%', makeText(m, H * 0.22, W - 2 * m, 360 * u, '', titleStyle(300, { color: 'theme:primary', lineHeight: 1 }), fixed)),
      ph('caption', 'What the number means', makeText(m, H * 0.22 + 380 * u, W * 0.75, 160 * u, '', bodyStyle(48, { color: 'theme:text' }), fixed)),
      footer(),
    ],
  };

  const quote: Layout = {
    id: 'quote',
    name: 'Quote',
    background: { kind: 'solid', color: 'theme:surface' },
    elements: [
      makeText(m - 10 * u, H * 0.12, 300 * u, 300 * u, '<p>“</p>', titleStyle(320, { color: 'theme:accent', lineHeight: 1 }), { name: 'Quote mark', autoHeight: false, padding: 0 }),
      ph('body', 'Quote text', makeText(m, H * 0.34, W - 2 * m, 320 * u, '', titleStyle(64, { bold: false, lineHeight: 1.2 }), fixed)),
      ph('caption', 'Who said it', makeText(m, H * 0.34 + 350 * u, W - 2 * m, 80 * u, '', bodyStyle(36, { color: 'theme:muted' }), fixed)),
    ],
  };

  const titleOnly: Layout = {
    id: 'title-only',
    name: 'Title only',
    background: bg,
    elements: [...decor(), ph('title', 'Click to add a title', makeText(m, titleY, W - 2 * m, titleH, '', titleStyle(76, { valign: 'bottom' }), fixed)), footer(), logo()],
  };

  const blank: Layout = { id: 'blank', name: 'Blank', background: bg, elements: [] };

  return [titleSlide, titleContent, twoContent, section, imageRight, bigNumber, quote, titleOnly, blank];
}

/** Creates a slide from a layout, instantiating one linked element per placeholder. */
export function makeSlide(layout: Layout, content: Partial<Record<PlaceholderKind, string>> = {}): Slide {
  const elements: SlideElement[] = [];
  for (const le of layout.elements) {
    if (!le.placeholder) continue;
    const link = { ref: le.id, geom: true, style: true };
    if (le.type === 'image') {
      elements.push({ ...structuredClone(le), id: uid(), placeholder: undefined, prompt: undefined, ph: link, assetId: content[le.placeholder] ?? '' });
    } else if (le.type === 'text') {
      elements.push({ ...structuredClone(le), id: uid(), placeholder: undefined, prompt: undefined, ph: link, html: content[le.placeholder] ?? '' });
    }
  }
  return { id: uid(), layoutId: layout.id, elements, notes: '', transition: 'fade' };
}

export function makeDeck(title: string, theme: Theme, size: DeckSize, variant: LayoutVariant = 'bar'): Deck {
  const layouts = makeLayouts(size, variant);
  const now = Date.now();
  return {
    id: uid(),
    title,
    version: 1,
    size,
    theme: structuredClone(theme),
    layouts,
    slides: [],
    assets: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneElement<T extends SlideElement>(el: T, dx = 0, dy = 0): T {
  return { ...structuredClone(el), id: uid(), x: el.x + dx, y: el.y + dy };
}

export function cloneSlide(slide: Slide): Slide {
  const groupMap = new Map<string, string>();
  return {
    ...structuredClone(slide),
    id: uid(),
    elements: slide.elements.map((e) => {
      const c = cloneElement(e);
      if (e.groupId) {
        if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, uid());
        c.groupId = groupMap.get(e.groupId);
      }
      return c;
    }),
  };
}
