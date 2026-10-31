import { sanitizeHtml } from '../render/richtext';
import PptxGenJS from 'pptxgenjs';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getFontEmbedCSS, toJpeg, toPng } from 'html-to-image';
import JSZip from 'jszip';
import type { Asset, Background, ChartElement, Deck, ImageElement, ShapeElement, SlideElement, TableElement, TextElement, Theme } from '../model/types';
import { applyTokens, getLayout, resolveElement, slideBackground } from '../model/resolve';
import { chartPalette, resolveColor, resolveFont, toHex } from '../model/theme';
import { SlideView } from '../render/SlideView';
import { chartColors } from '../render/ChartView';
import { downloadBlob, safeFilename } from './deckfile';

// ---------------------------------------------------------------------------
// PowerPoint export: real text boxes, shapes, native charts and tables.
// ---------------------------------------------------------------------------

function hex6(color: string | undefined, theme: Theme): string | undefined {
  if (!color || color === 'transparent') return undefined;
  const h = toHex(resolveColor(color, theme));
  return h ? h.slice(1).toUpperCase() : undefined;
}

function slideInches(deck: Deck) {
  const { w, h } = deck.size;
  return w >= h ? { inW: 13.333, inH: (13.333 * h) / w } : { inW: (13.333 * w) / h, inH: 13.333 };
}

interface RunBase {
  fontFace: string;
  fontSize: number; // pt
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** Converts our rich-text HTML into PptxGenJS text runs, keeping bold/italic/colour/size and bullets. */
export function htmlToRuns(html: string, base: RunBase, ptPerPx: number, theme: Theme, align: string): PptxGenJS.TextProps[] {
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(html);
  const paragraphs: { runs: PptxGenJS.TextProps[]; para: Record<string, unknown> }[] = [];

  const walk = (node: Node, style: RunBase & { strike: boolean }, out: PptxGenJS.TextProps[]) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/ /g, ' ');
      if (text) {
        out.push({
          text,
          options: {
            fontFace: style.fontFace,
            fontSize: style.fontSize,
            color: style.color,
            bold: style.bold,
            italic: style.italic,
            underline: style.underline ? { style: 'sng' } : undefined,
            strike: style.strike ? 'sngStrike' : undefined,
          },
        });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') {
      out.push({ text: '', options: { breakLine: true } });
      return;
    }
    const s = { ...style };
    if (tag === 'B' || tag === 'STRONG') s.bold = true;
    if (tag === 'I' || tag === 'EM') s.italic = true;
    if (tag === 'U') s.underline = true;
    if (tag === 'S' || tag === 'STRIKE') s.strike = true;
    const st = el.style;
    if (st.fontWeight) s.bold = st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600;
    if (st.fontStyle) s.italic = st.fontStyle === 'italic';
    const deco = st.textDecorationLine || st.textDecoration;
    if (deco) {
      if (deco.includes('underline')) s.underline = true;
      if (deco.includes('line-through')) s.strike = true;
    }
    if (st.color) {
      const h = toHex(st.color);
      if (h) s.color = h.slice(1).toUpperCase();
    }
    if (st.fontSize && st.fontSize.endsWith('px')) s.fontSize = Math.round(parseFloat(st.fontSize) * ptPerPx * 10) / 10;
    if (st.fontFamily) s.fontFace = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    el.childNodes.forEach((c) => walk(c, s, out));
  };

  const start = { ...base, strike: false };
  const paraAlign = (el: HTMLElement) => {
    const a = el.style.textAlign || align;
    return a === 'justify' ? 'justify' : a === 'center' ? 'center' : a === 'right' ? 'right' : 'left';
  };

  const handleList = (list: HTMLElement, level: number) => {
    const ordered = list.tagName === 'OL';
    Array.from(list.children).forEach((li) => {
      if (li.tagName !== 'LI') return;
      const runs: PptxGenJS.TextProps[] = [];
      const nested: HTMLElement[] = [];
      li.childNodes.forEach((c) => {
        if (c.nodeType === 1 && ['UL', 'OL'].includes((c as HTMLElement).tagName)) nested.push(c as HTMLElement);
        else walk(c, start, runs);
      });
      paragraphs.push({ runs, para: { bullet: ordered ? { type: 'number' } : true, indentLevel: level, align: paraAlign(li as HTMLElement) } });
      nested.forEach((n) => handleList(n, level + 1));
    });
  };

  const loose: PptxGenJS.TextProps[] = [];
  const flushLoose = () => {
    if (loose.length) paragraphs.push({ runs: loose.splice(0), para: { align } });
  };
  root.childNodes.forEach((node) => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        flushLoose();
        handleList(el, 0);
        return;
      }
      if (el.tagName === 'P' || el.tagName === 'DIV') {
        flushLoose();
        const runs: PptxGenJS.TextProps[] = [];
        el.childNodes.forEach((c) => walk(c, start, runs));
        paragraphs.push({ runs, para: { align: paraAlign(el) } });
        return;
      }
    }
    walk(node, start, loose);
  });
  flushLoose();

  const out: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((p, pi) => {
    const runs = p.runs.length ? p.runs : [{ text: '', options: { fontSize: base.fontSize } }];
    runs.forEach((r, ri) => {
      const isLast = ri === runs.length - 1;
      out.push({ text: r.text, options: { ...(r.options ?? {}), ...p.para, breakLine: isLast && pi < paragraphs.length - 1 ? true : r.options?.breakLine } as PptxGenJS.TextPropsOptions });
    });
  });
  return out;
}

async function loadImg(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Bakes crop, fit, rounded corners and filters into a bitmap so PowerPoint shows exactly what the editor shows. */
async function bakeImage(asset: Asset, el: ImageElement): Promise<string> {
  const img = await loadImg(asset.dataUrl);
  const maxSide = 2000;
  const k = Math.min(1, maxSide / Math.max(el.w, el.h)) * Math.max(1, Math.min(2, asset.w / el.w));
  const cw = Math.max(1, Math.round(el.w * k));
  const ch = Math.max(1, Math.round(el.h * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  const f = el.filters;
  ctx.filter = `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) grayscale(${f.grayscale})`;
  if (el.radius > 0) {
    const r = Math.min(el.radius * k, cw / 2, ch / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, r);
    ctx.clip();
  }
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const s = el.fit === 'cover' ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  const needsAlpha = el.fit === 'contain' || el.radius > 0 || asset.dataUrl.startsWith('data:image/png') || asset.dataUrl.startsWith('data:image/svg');
  return needsAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
}

async function backgroundImage(bg: Background, deck: Deck, pxW: number, pxH: number): Promise<string | null> {
  if (bg.kind === 'solid') return null;
  const c = document.createElement('canvas');
  const k = Math.min(1, 1920 / pxW);
  c.width = Math.round(pxW * k);
  c.height = Math.round(pxH * k);
  const ctx = c.getContext('2d')!;
  if (bg.kind === 'gradient') {
    // Match CSS linear-gradient(angle): 0deg points up, 90deg points right.
    const a = ((bg.angle - 90) * Math.PI) / 180;
    const len = Math.abs(c.width * Math.cos(a)) + Math.abs(c.height * Math.sin(a));
    const cx = c.width / 2;
    const cy = c.height / 2;
    const g = ctx.createLinearGradient(cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2, cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2);
    g.addColorStop(0, resolveColor(bg.from, deck.theme));
    g.addColorStop(1, resolveColor(bg.to, deck.theme));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  const asset = deck.assets[bg.assetId];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  if (asset) {
    const img = await loadImg(asset.dataUrl);
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    ctx.drawImage(img, (c.width - img.naturalWidth * s) / 2, (c.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  }
  ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
  ctx.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

const SHAPE_MAP: Record<string, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  chevron: 'chevron',
  star: 'star5',
};

export async function buildPptx(deck: Deck): Promise<PptxGenJS> {
  const pptx = new PptxGenJS();
  const { inW, inH } = slideInches(deck);
  pptx.defineLayout({ name: 'DECKFORGE', width: inW, height: inH });
  pptx.layout = 'DECKFORGE';
  pptx.title = deck.title;
  pptx.company = 'Made with OpenSlides';
  pptx.theme = { headFontFace: deck.theme.fonts.heading, bodyFontFace: deck.theme.fonts.body };
  const theme = deck.theme;
  const k = inW / deck.size.w; // inches per slide px
  const ptPerPx = k * 72;
  const bakeCache = new Map<string, string>();

  for (let si = 0; si < deck.slides.length; si++) {
    const slide = deck.slides[si];
    const s = pptx.addSlide();
    if (slide.hidden) s.hidden = true;
    const layout = getLayout(deck, slide.layoutId);
    const bg = slideBackground(deck, slide);
    if (bg.kind === 'solid') s.background = { color: hex6(bg.color, theme) ?? 'FFFFFF' };
    else {
      const data = await backgroundImage(bg, deck, deck.size.w, deck.size.h);
      if (data) s.background = { data };
    }
    const tokens = { n: si + 1, total: deck.slides.length, title: deck.title };
    const elements: SlideElement[] = [...layout.elements.filter((e) => !e.placeholder), ...slide.elements.map((e) => resolveElement(e, layout))];
    for (const el of elements) {
      const pos = { x: el.x * k, y: el.y * k, w: Math.max(0.01, el.w * k), h: Math.max(0.01, el.h * k), rotate: el.rotation || undefined };
      const transparency = el.opacity < 1 ? Math.round((1 - el.opacity) * 100) : undefined;
      if (el.type === 'text') addText(s, el, pos, theme, ptPerPx, tokens, transparency);
      else if (el.type === 'shape') addShape(pptx, s, el, pos, theme, ptPerPx, transparency);
      else if (el.type === 'image') {
        const id = el.assetId === 'theme:logo' ? theme.logoAssetId : el.assetId;
        const asset = id ? deck.assets[id] : undefined;
        if (!asset) continue;
        const key = `${asset.id}|${el.w}|${el.h}|${el.fit}|${el.radius}|${JSON.stringify(el.filters)}`;
        let data = bakeCache.get(key);
        if (!data) {
          data = await bakeImage(asset, el);
          bakeCache.set(key, data);
        }
        s.addImage({ data, ...pos, altText: el.alt || undefined, transparency } as PptxGenJS.ImageProps);
      } else if (el.type === 'chart') addChart(pptx, s, el, pos, theme, ptPerPx);
      else if (el.type === 'table') addTable(s, el, pos, theme, ptPerPx);
    }
    if (slide.notes) s.addNotes(slide.notes);
  }
  return pptx;
}

type Pos = { x: number; y: number; w: number; h: number; rotate?: number };

function addText(s: PptxGenJS.Slide, el: TextElement, pos: Pos, theme: Theme, ptPerPx: number, tokens: { n: number; total: number; title: string }, transparency?: number) {
  const html = applyTokens(el.html, tokens);
  if (!html.replace(/<[^>]*>/g, '').trim()) {
    if (el.fill === 'transparent') return;
  }
  const st = el.style;
  const base: RunBase = {
    fontFace: resolveFont(st.fontFamily, theme),
    fontSize: Math.round(st.fontSize * ptPerPx * 10) / 10,
    color: hex6(st.color, theme) ?? '000000',
    bold: st.bold,
    italic: st.italic,
    underline: st.underline,
  };
  const runs = htmlToRuns(html, base, ptPerPx, theme, st.align);
  s.addText(runs.length ? runs : '', {
    ...pos,
    valign: st.valign,
    align: st.align,
    lineSpacingMultiple: st.lineHeight,
    charSpacing: st.letterSpacing ? Math.round(st.letterSpacing * base.fontSize * 10) / 10 : undefined,
    margin: Math.round(el.padding * ptPerPx * 10) / 10,
    fill: hex6(el.fill, theme) ? { color: hex6(el.fill, theme)!, transparency } : undefined,
    fit: 'none',
    wrap: true,
  } as PptxGenJS.TextPropsOptions);
}

function addShape(pptx: PptxGenJS, s: PptxGenJS.Slide, el: ShapeElement, pos: Pos, theme: Theme, ptPerPx: number, transparency?: number) {
  const line = hex6(el.stroke, theme);
  if (el.shape === 'line' || el.shape === 'arrow') {
    s.addShape('line' as PptxGenJS.SHAPE_NAME, {
      x: pos.x,
      y: pos.y + pos.h / 2,
      w: pos.w,
      h: 0,
      rotate: pos.rotate,
      line: { color: line ?? '000000', width: Math.max(0.5, el.strokeWidth * ptPerPx), endArrowType: el.shape === 'arrow' ? 'triangle' : undefined },
    });
    return;
  }
  const fill = hex6(el.fill, theme);
  const r = Math.min(el.w, el.h) / 2;
  s.addShape(SHAPE_MAP[el.shape] as PptxGenJS.SHAPE_NAME, {
    ...pos,
    fill: fill ? { color: fill, transparency } : { type: 'none' },
    line: line && el.strokeWidth > 0 ? { color: line, width: el.strokeWidth * ptPerPx } : { type: 'none' },
    rectRadius: el.shape === 'roundRect' && r > 0 ? Math.min(1, el.radius / r) : undefined,
  } as PptxGenJS.ShapeProps);
  void pptx;
}

function addChart(pptx: PptxGenJS, s: PptxGenJS.Slide, el: ChartElement, pos: Pos, theme: Theme, ptPerPx: number) {
  const types: Record<string, PptxGenJS.CHART_NAME> = {
    column: pptx.ChartType.bar,
    bar: pptx.ChartType.bar,
    line: pptx.ChartType.line,
    area: pptx.ChartType.area,
    pie: pptx.ChartType.pie,
    doughnut: pptx.ChartType.doughnut,
  };
  const isPie = el.chartType === 'pie' || el.chartType === 'doughnut';
  const series = isPie ? el.data.series.slice(0, 1) : el.data.series;
  const data = series.map((sr) => ({ name: sr.name, labels: el.data.labels, values: el.data.labels.map((_, i) => sr.values[i] ?? 0) }));
  const colors = chartColors(el, theme).map((c) => (toHex(c) ?? '#000000').slice(1).toUpperCase());
  const text = hex6(el.textColor, theme) ?? '333333';
  const fs = Math.max(6, Math.round(el.fontSize * ptPerPx * 0.85));
  const face = resolveFont(el.fontFamily, theme);
  s.addChart(types[el.chartType], data, {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    barDir: el.chartType === 'bar' ? 'bar' : 'col',
    barGrouping: 'clustered',
    barGapWidthPct: 40,
    // One series: keep a single colour (PowerPoint would otherwise vary it per bar).
    chartColors: !isPie && series.length === 1 ? [colors[0]] : colors,
    showLegend: el.showLegend && (isPie || series.length > 1),
    legendPos: 'b',
    legendFontSize: fs,
    legendColor: text,
    legendFontFace: face,
    showTitle: !!el.title,
    title: el.title || undefined,
    titleFontSize: Math.round(fs * 1.15),
    titleColor: text,
    titleFontFace: face,
    showValue: el.showValues && !isPie,
    showPercent: el.showValues && isPie,
    dataLabelColor: isPie ? 'FFFFFF' : text,
    dataLabelFontSize: fs,
    dataLabelFontFace: face,
    catAxisLabelColor: text,
    valAxisLabelColor: text,
    catAxisLabelFontSize: fs,
    valAxisLabelFontSize: fs,
    catAxisLabelFontFace: face,
    valAxisLabelFontFace: face,
    valGridLine: el.showGrid ? { color: hex6('theme:muted', theme) ?? 'CCCCCC', size: 0.5 } : { style: 'none' },
    catGridLine: { style: 'none' },
    lineSize: 2,
    lineDataSymbolSize: 6,
    holeSize: 55,
    altText: el.alt || el.title || undefined,
  } as PptxGenJS.IChartOpts);
}

function addTable(s: PptxGenJS.Slide, el: TableElement, pos: Pos, theme: Theme, ptPerPx: number) {
  const st = el.style;
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const border = hex6(st.borderColor, theme);
  const rows: PptxGenJS.TableRow[] = el.rows.map((r, ri) => {
    const header = el.headerRow && ri === 0;
    const stripe = !header && st.stripe && ri % 2 === (el.headerRow ? 0 : 1);
    const fill = header ? hex6(st.headerFill, theme) : stripe ? hex6(st.stripeFill, theme) : hex6(st.fill, theme);
    return Array.from({ length: cols }, (_, ci) => ({
      text: r[ci] ?? '',
      options: {
        bold: header,
        color: header ? hex6(st.headerColor, theme) : hex6(st.color, theme),
        fill: fill ? { color: fill } : undefined,
      },
    }));
  });
  s.addTable(rows, {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    colW: Array(cols).fill(pos.w / cols),
    rowH: pos.h / Math.max(1, el.rows.length),
    fontFace: resolveFont(st.fontFamily, theme),
    fontSize: Math.max(6, Math.round(st.fontSize * ptPerPx * 10) / 10),
    color: hex6(st.color, theme),
    valign: 'middle',
    border: border ? { type: 'solid', pt: 1, color: border } : { type: 'none' },
    margin: (st.fontSize * 0.35 * pos.w) / el.w / 1, // inches
  } as PptxGenJS.TableProps);
}

export async function exportPptx(deck: Deck) {
  const pptx = await buildPptx(deck);
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  downloadBlob(blob, `${safeFilename(deck.title)}.pptx`);
}

// ---------------------------------------------------------------------------
// Image and PDF export: render slides offscreen exactly as the editor draws them.
// ---------------------------------------------------------------------------

async function renderSlides<T>(deck: Deck, indices: number[], capture: (node: HTMLElement, fontEmbedCSS: string) => Promise<T>): Promise<T[]> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(
        <div>
          {indices.map((i) => (
            <div key={i} data-export={i} style={{ width: deck.size.w, height: deck.size.h }}>
              <SlideView deck={deck} slide={deck.slides[i]} mode="export" scale={1} index={i} />
            </div>
          ))}
        </div>,
      ),
    );
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
    const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-export]'));
    const fontEmbedCSS = nodes.length ? await getFontEmbedCSS(nodes[0]) : '';
    const out: T[] = [];
    for (const n of nodes) out.push(await capture(n, fontEmbedCSS));
    return out;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportPng(deck: Deck, index: number) {
  const [url] = await renderSlides(deck, [index], (n, css) => toPng(n, { width: deck.size.w, height: deck.size.h, pixelRatio: 1, fontEmbedCSS: css }));
  const blob = await (await fetch(url)).blob();
  downloadBlob(blob, `${safeFilename(deck.title)} - slide ${index + 1}.png`);
}

export async function exportAllPngs(deck: Deck) {
  const indices = deck.slides.map((_, i) => i);
  const urls = await renderSlides(deck, indices, (n, css) => toPng(n, { width: deck.size.w, height: deck.size.h, pixelRatio: 1, fontEmbedCSS: css }));
  const zip = new JSZip();
  urls.forEach((u, i) => zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, u.split(',')[1], { base64: true }));
  downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeFilename(deck.title)} slides.zip`);
}

export async function exportPdf(deck: Deck) {
  const { jsPDF } = await import('jspdf');
  const indices = deck.slides.map((_, i) => i).filter((i) => !deck.slides[i].hidden);
  const list = indices.length ? indices : deck.slides.map((_, i) => i);
  const urls = await renderSlides(deck, list, (n, css) => toJpeg(n, { width: deck.size.w, height: deck.size.h, pixelRatio: 1, quality: 0.92, fontEmbedCSS: css, backgroundColor: '#ffffff' }));
  const { inW, inH } = slideInches(deck);
  const pw = inW * 72;
  const ph = inH * 72;
  const pdf = new jsPDF({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'pt', format: [pw, ph], compress: true });
  urls.forEach((u, i) => {
    if (i > 0) pdf.addPage([pw, ph], pw >= ph ? 'landscape' : 'portrait');
    pdf.addImage(u, 'JPEG', 0, 0, pw, ph);
  });
  pdf.setProperties({ title: deck.title, creator: 'OpenSlides' });
  downloadBlob(pdf.output('blob'), `${safeFilename(deck.title)}.pdf`);
}

export { chartPalette };
