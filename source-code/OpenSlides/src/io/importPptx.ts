import JSZip from 'jszip';
import type { Asset, Background, ChartData, ChartType, Deck, ShapeKind, Slide, SlideElement, TextElement } from '../model/types';
import { makeChart, makeDeck, makeImage, makeShape, makeTable, makeText, uid } from '../model/factory';
import { THEME_PRESETS, contrastRatio, hexToRgb, rgbToHex } from '../model/theme';

// Reads PowerPoint files (Office Open XML). A .pptx is a zip of XML parts:
// ppt/presentation.xml lists the slides, each slide's spTree holds shapes,
// pictures, tables and charts, and placeholders inherit position and type
// sizes from their layout and master. We decode the subset that maps onto
// OpenSlides's model and report what we had to skip.

const EMU_PER_PT = 12700;

export interface ImportReport {
  deck: Deck;
  skipped: string[];
}

// ---------- small XML helpers (namespace-agnostic) ----------

const kids = (el: Element | null | undefined, name: string): Element[] => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string): Element | undefined => kids(el, name)[0];
const desc = (el: Element | Document | null | undefined, name: string): Element[] => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
const at = (el: Element | undefined, name: string) => el?.getAttribute(name) ?? null;
const num = (v: string | null, d = 0) => (v === null || v === '' || Number.isNaN(+v) ? d : +v);

function parseXml(s: string): Document {
  return new DOMParser().parseFromString(s, 'application/xml');
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const out: string[] = [];
  for (const p of `${dir}/${target}`.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

interface Rel {
  target: string;
  type: string;
}

async function readRels(zip: JSZip, part: string): Promise<Map<string, Rel>> {
  const dir = part.slice(0, part.lastIndexOf('/'));
  const file = part.slice(part.lastIndexOf('/') + 1);
  const xml = await zip.file(`${dir}/_rels/${file}.rels`)?.async('string');
  const map = new Map<string, Rel>();
  if (!xml) return map;
  for (const r of desc(parseXml(xml), 'Relationship')) {
    if (r.getAttribute('TargetMode') === 'External') continue;
    map.set(r.getAttribute('Id') ?? '', { target: resolvePath(dir, r.getAttribute('Target') ?? ''), type: r.getAttribute('Type') ?? '' });
  }
  return map;
}

const relByType = (rels: Map<string, Rel>, suffix: string) => [...rels.values()].find((r) => r.type.endsWith(suffix));

// ---------- colour ----------

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

function applyMods(hex: string, el: Element): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let [h, s, l] = rgbToHsl(...rgb);
  const lumMod = kid(el, 'lumMod');
  const lumOff = kid(el, 'lumOff');
  const tint = kid(el, 'tint');
  const shade = kid(el, 'shade');
  if (lumMod) l *= num(at(lumMod, 'val'), 100000) / 100000;
  if (lumOff) l += num(at(lumOff, 'val'), 0) / 100000;
  if (tint) l = l + (1 - l) * (1 - num(at(tint, 'val'), 100000) / 100000);
  if (shade) l *= num(at(shade, 'val'), 100000) / 100000;
  l = Math.max(0, Math.min(1, l));
  return rgbToHex(...hslToRgb(h, s, l));
}

type Scheme = Record<string, string>;

const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2', phClr: 'accent1' };

function colorChoice(el: Element | undefined, scheme: Scheme): string | null {
  if (!el) return null;
  const srgb = kid(el, 'srgbClr');
  if (srgb) return applyMods(`#${at(srgb, 'val') ?? '000000'}`, srgb);
  const sch = kid(el, 'schemeClr');
  if (sch) {
    const v = at(sch, 'val') ?? 'tx1';
    const hex = scheme[SCHEME_ALIAS[v] ?? v];
    return hex ? applyMods(hex, sch) : null;
  }
  const sys = kid(el, 'sysClr');
  if (sys) return applyMods(`#${at(sys, 'lastClr') ?? '000000'}`, sys);
  const prst = kid(el, 'prstClr');
  if (prst) return ({ white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000' } as Record<string, string>)[at(prst, 'val') ?? ''] ?? null;
  return null;
}

/** 'transparent' for noFill, a hex for solidFill, null if the element doesn't say. */
function fillOf(parent: Element | undefined, scheme: Scheme): string | null {
  if (!parent) return null;
  if (kid(parent, 'noFill')) return 'transparent';
  const solid = kid(parent, 'solidFill');
  if (solid) return colorChoice(solid, scheme);
  const grad = kid(parent, 'gradFill');
  if (grad) {
    const stops = desc(grad, 'gs');
    return colorChoice(stops[0], scheme);
  }
  return null;
}

// ---------- geometry ----------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flipH: boolean;
  flipV: boolean;
}

type Xform = (b: Box) => Box;

function readXfrm(xfrm: Element | undefined, k: number): Box | null {
  if (!xfrm) return null;
  const off = kid(xfrm, 'off');
  const ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: num(at(off, 'x')) * k,
    y: num(at(off, 'y')) * k,
    w: num(at(ext, 'cx')) * k,
    h: num(at(ext, 'cy')) * k,
    rot: num(at(xfrm, 'rot')) / 60000,
    flipH: at(xfrm, 'flipH') === '1',
    flipV: at(xfrm, 'flipV') === '1',
  };
}

// ---------- placeholders ----------

interface PhInfo {
  type: string;
  idx: string | null;
}

function phOf(shape: Element): PhInfo | null {
  const nv = shape.firstElementChild;
  const ph = desc(nv, 'ph')[0];
  if (!ph) return null;
  return { type: at(ph, 'type') ?? 'obj', idx: at(ph, 'idx') };
}

function findPh(tree: Document | undefined, ph: PhInfo): Element | undefined {
  if (!tree) return undefined;
  const shapes = desc(tree, 'sp');
  const isTitle = (t: string) => t === 'title' || t === 'ctrTitle';
  return (
    shapes.find((s) => {
      const p = phOf(s);
      return p && ph.idx !== null && p.idx === ph.idx;
    }) ??
    shapes.find((s) => {
      const p = phOf(s);
      return p && (p.type === ph.type || (isTitle(p.type) && isTitle(ph.type)));
    }) ??
    (ph.type === 'obj' || ph.type === 'subTitle'
      ? shapes.find((s) => {
          const p = phOf(s);
          return p && p.type === 'body';
        })
      : undefined)
  );
}

// ---------- the importer ----------

interface Ctx {
  zip: JSZip;
  k: number; // slide px per EMU
  pxPerPt: number;
  scheme: Scheme;
  majorFont: string;
  minorFont: string;
  titleSz: number;
  bodySz: number;
  otherSz: number;
  assets: Record<string, Asset>;
  skipped: Set<string>;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

async function loadMedia(ctx: Ctx, path: string): Promise<string | null> {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!mime) {
    ctx.skipped.add(`${ext.toUpperCase()} images (not supported by browsers)`);
    return null;
  }
  const existing = Object.values(ctx.assets).find((a) => a.name === path);
  if (existing) return existing.id;
  const b64 = await ctx.zip.file(path)?.async('base64');
  if (!b64) return null;
  const dataUrl = `data:${mime};base64,${b64}`;
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = dataUrl;
  });
  const id = uid();
  ctx.assets[id] = { id, dataUrl, w: dims.w, h: dims.h, name: path };
  return id;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface RunProps {
  size: number; // pt
  bold: boolean;
  italic: boolean;
  deco: string;
  color: string | null;
  font: string | null;
}

function runProps(rPr: Element | undefined, ctx: Ctx, defaultSz: number): RunProps {
  const u = at(rPr, 'u');
  const strike = at(rPr, 'strike');
  const c = rPr ? fillOf(rPr, ctx.scheme) : null;
  const latin = at(kid(rPr, 'latin'), 'typeface');
  return {
    size: at(rPr, 'sz') ? num(at(rPr, 'sz')) / 100 : defaultSz,
    bold: at(rPr, 'b') === '1',
    italic: at(rPr, 'i') === '1',
    deco: [u && u !== 'none' ? 'underline' : '', strike && strike !== 'noStrike' ? 'line-through' : ''].filter(Boolean).join(' '),
    color: c && c !== 'transparent' ? c : null,
    font: latin && !latin.startsWith('+') ? latin : null,
  };
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * Converts a txBody into our HTML. The most common size, colour and font become
 * the text box's own style; only runs that differ keep inline styles.
 */
function textBody(txBody: Element, ctx: Ctx, defaultSz: number, bulletsByDefault: boolean) {
  const paras = kids(txBody, 'p');
  let align: TextElement['style']['align'] = 'left';
  type Piece = { text: string; props: RunProps } | { br: true };
  const blocks: { pieces: Piece[]; bullet: 'none' | 'ul' | 'ol'; lvl: number; align: string }[] = [];
  const all: RunProps[] = [];
  paras.forEach((p, pi) => {
    const pPr = kid(p, 'pPr');
    const algn = at(pPr, 'algn');
    const a = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left';
    if (pi === 0) align = a;
    const pieces: Piece[] = [];
    let hasText = false;
    for (const c of Array.from(p.children)) {
      if (c.localName === 'r' || c.localName === 'fld') {
        const t = kid(c, 't')?.textContent ?? '';
        if (!t) continue;
        hasText = true;
        const props = runProps(kid(c, 'rPr'), ctx, defaultSz);
        all.push(props);
        pieces.push({ text: t, props });
      } else if (c.localName === 'br') pieces.push({ br: true });
    }
    const bullet = kid(pPr, 'buNone') ? 'none' : kid(pPr, 'buAutoNum') ? 'ol' : kid(pPr, 'buChar') || (bulletsByDefault && hasText) ? 'ul' : 'none';
    blocks.push({ pieces, bullet, lvl: num(at(pPr, 'lvl')), align: a });
  });
  const baseSize = mostCommon(all.map((r) => r.size)) ?? defaultSz;
  const baseColor = mostCommon(all.map((r) => r.color)) ?? null;
  const baseFont = mostCommon(all.map((r) => r.font)) ?? null;
  const allBold = all.length > 0 && all.every((r) => r.bold);
  const allItalic = all.length > 0 && all.every((r) => r.italic);

  const pieceHtml = (pc: Piece) => {
    if ('br' in pc) return '<br>';
    const r = pc.props;
    const css: string[] = [];
    if (r.size !== baseSize) css.push(`font-size: ${Math.round(r.size * ctx.pxPerPt)}px`);
    if (r.bold && !allBold) css.push('font-weight: bold');
    if (r.italic && !allItalic) css.push('font-style: italic');
    if (r.deco) css.push(`text-decoration: ${r.deco}`);
    if (r.color && r.color !== baseColor) css.push(`color: ${r.color}`);
    if (r.font && r.font !== baseFont) css.push(`font-family: "${r.font}"`);
    return css.length ? `<span style="${css.join('; ')}">${esc(pc.text)}</span>` : esc(pc.text);
  };

  let out = '';
  let open: 'ul' | 'ol' | null = null;
  for (const b of blocks) {
    const html = b.pieces.map(pieceHtml).join('') || '<br>';
    const alignCss = b.align !== align ? ` style="text-align: ${b.align}"` : '';
    if (b.bullet !== 'none') {
      if (open !== b.bullet) {
        if (open) out += `</${open}>`;
        out += `<${b.bullet}>`;
        open = b.bullet;
      }
      const indent = b.lvl ? ` style="margin-left: ${b.lvl * 1.2}em"` : '';
      out += `<li${indent}>${html}</li>`;
    } else {
      if (open) {
        out += `</${open}>`;
        open = null;
      }
      out += `<p${alignCss}>${html}</p>`;
    }
  }
  if (open) out += `</${open}>`;
  return { html: all.length ? out : '', size: baseSize, color: baseColor, font: baseFont, bold: allBold, italic: allItalic, align };
}

const PRST: Record<string, ShapeKind> = {
  rect: 'rect',
  roundRect: 'roundRect',
  snipRoundRect: 'roundRect',
  round2SameRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rtTriangle: 'triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  chevron: 'chevron',
  homePlate: 'chevron',
  star5: 'star',
  star4: 'star',
  star6: 'star',
  line: 'line',
  straightConnector1: 'line',
};

interface SlideParts {
  slide: Document;
  layout?: Document;
  master?: Document;
  rels: Map<string, Rel>;
  path: string;
}

async function convertShape(el: Element, parts: SlideParts, ctx: Ctx, xf: Xform, out: SlideElement[]) {
  const name = el.localName;
  if (name === 'grpSp') {
    const g = kid(kid(el, 'grpSpPr'), 'xfrm');
    const off = kid(g, 'off');
    const ext = kid(g, 'ext');
    const chOff = kid(g, 'chOff');
    const chExt = kid(g, 'chExt');
    let inner: Xform = xf;
    if (off && ext && chOff && chExt) {
      const sx = num(at(ext, 'cx')) / Math.max(1, num(at(chExt, 'cx')));
      const sy = num(at(ext, 'cy')) / Math.max(1, num(at(chExt, 'cy')));
      const ox = num(at(off, 'x')) * ctx.k;
      const oy = num(at(off, 'y')) * ctx.k;
      const cx0 = num(at(chOff, 'x')) * ctx.k;
      const cy0 = num(at(chOff, 'y')) * ctx.k;
      inner = (b) => xf({ ...b, x: ox + (b.x - cx0) * sx, y: oy + (b.y - cy0) * sy, w: b.w * sx, h: b.h * sy });
    }
    const groupId = uid();
    const start = out.length;
    for (const c of Array.from(el.children)) await convertShape(c, parts, ctx, inner, out);
    if (out.length - start > 1) for (let i = start; i < out.length; i++) out[i].groupId = groupId;
    return;
  }
  if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(name)) return;

  const ph = name === 'sp' || name === 'pic' ? phOf(el) : null;
  const spPr = kid(el, 'spPr');
  let box = readXfrm(name === 'graphicFrame' ? kid(el, 'xfrm') : kid(spPr, 'xfrm'), ctx.k);
  const layoutPh = ph ? findPh(parts.layout, ph) : undefined;
  const masterPh = ph ? findPh(parts.master, ph) : undefined;
  if (!box && ph) box = readXfrm(kid(kid(layoutPh, 'spPr'), 'xfrm'), ctx.k) ?? readXfrm(kid(kid(masterPh, 'spPr'), 'xfrm'), ctx.k);
  if (!box) return;
  box = xf(box);
  const base = { x: box.x, y: box.y, w: Math.max(2, box.w), h: Math.max(2, box.h) };
  const rotation = box.rot;

  if (name === 'pic') {
    const embed = desc(kid(el, 'blipFill'), 'blip')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? at(desc(kid(el, 'blipFill'), 'blip')[0], 'r:embed');
    const rel = embed ? parts.rels.get(embed) : undefined;
    if (!rel) return;
    const id = await loadMedia(ctx, rel.target);
    if (!id) return;
    const img = makeImage(id, base.x, base.y, base.w, base.h, { rotation, alt: at(desc(el, 'cNvPr')[0], 'descr') ?? '' });
    img.fit = 'cover';
    out.push(img);
    return;
  }

  if (name === 'graphicFrame') {
    const data = desc(el, 'graphicData')[0];
    const uri = at(data, 'uri') ?? '';
    const tbl = desc(data, 'tbl')[0];
    if (tbl) {
      const rows = kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => desc(tc, 'p').map((p) => desc(p, 't').map((t) => t.textContent).join('')).join('\n')));
      const firstRow = at(kid(tbl, 'tblPr'), 'firstRow') === '1';
      const sz = desc(tbl, 'rPr').map((r) => num(at(r, 'sz')) / 100).find((v) => v > 0) ?? 14;
      const t = makeTable(rows.length ? rows : [['']], base.x, base.y, base.w, base.h, { headerRow: firstRow });
      t.style.fontSize = Math.round(sz * ctx.pxPerPt);
      out.push(t);
      return;
    }
    if (uri.includes('chart')) {
      const rid = desc(data, 'chart')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = rid ? parts.rels.get(rid) : undefined;
      const xml = rel ? await ctx.zip.file(rel.target)?.async('string') : undefined;
      const chart = xml ? readChart(parseXml(xml), ctx.scheme) : null;
      if (chart) {
        out.push(makeChart(chart.type, base.x, base.y, base.w, base.h, { data: chart.data, title: chart.title, showLegend: chart.legend, colors: chart.colors, showValues: chart.showValues, fontSize: Math.round(14 * ctx.pxPerPt) }));
      } else ctx.skipped.add('some charts');
      return;
    }
    ctx.skipped.add('embedded objects (SmartArt, OLE, video)');
    return;
  }

  // sp and cxnSp: shapes, text boxes, lines
  const geom = at(kid(spPr, 'prstGeom'), 'prst') ?? (kid(spPr, 'custGeom') ? 'custom' : 'rect');
  const style = kid(el, 'style');
  let fill = fillOf(spPr, ctx.scheme);
  if (fill === null && style && name === 'sp' && !ph) fill = colorChoice(kid(style, 'fillRef'), ctx.scheme);
  const ln = kid(spPr, 'ln');
  let lineColor = fillOf(ln, ctx.scheme);
  if (lineColor === null && style && (name === 'cxnSp' || !ph)) lineColor = colorChoice(kid(style, 'lnRef'), ctx.scheme);
  const lineW = ln && at(ln, 'w') ? Math.max(1, num(at(ln, 'w')) * ctx.k) : name === 'cxnSp' ? 2 : 0;

  const kind = PRST[geom];
  if (name === 'cxnSp' || kind === 'line') {
    const x1 = box.flipH ? box.x + box.w : box.x;
    const y1 = box.flipV ? box.y + box.h : box.y;
    const x2 = box.flipH ? box.x : box.x + box.w;
    const y2 = box.flipV ? box.y : box.y + box.h;
    const len = Math.max(2, Math.hypot(x2 - x1, y2 - y1));
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const thick = Math.max(lineW * 3, 12);
    const arrow = !!kid(ln, 'tailEnd') && at(kid(ln, 'tailEnd'), 'type') !== 'none';
    out.push(
      makeShape(arrow ? 'arrow' : 'line', (x1 + x2) / 2 - len / 2, (y1 + y2) / 2 - thick / 2, len, thick, {
        rotation: ang,
        stroke: lineColor && lineColor !== 'transparent' ? lineColor : '#000000',
        strokeWidth: lineW || 2,
      }),
    );
    return;
  }
  if (geom === 'custom' || (!kind && geom !== 'rect')) ctx.skipped.add('custom or unusual shapes (drawn as rectangles)');

  const txBody = kid(el, 'txBody');
  const isTitle = ph && (ph.type === 'title' || ph.type === 'ctrTitle');
  const defaultSz = isTitle ? ctx.titleSz : ph ? ctx.bodySz : ctx.otherSz;
  const layoutBodyPr = kid(kid(layoutPh, 'txBody'), 'bodyPr') ?? kid(kid(masterPh, 'txBody'), 'bodyPr');
  const bodyPr = kid(txBody, 'bodyPr');
  const anchor = at(bodyPr, 'anchor') ?? at(layoutBodyPr, 'anchor') ?? (isTitle ? 'ctr' : 't');
  const text = txBody ? textBody(txBody, ctx, defaultSz, !!ph && (ph.type === 'body' || ph.type === 'obj')) : null;

  const hasFill = fill && fill !== 'transparent';
  const hasLine = lineColor && lineColor !== 'transparent' && lineW > 0;
  const plainBox = (geom === 'rect' || !kind) && !rotation;

  if ((hasFill || hasLine) && !(plainBox && text?.html && !hasLine)) {
    out.push(
      makeShape(kind ?? 'rect', base.x, base.y, base.w, base.h, {
        rotation,
        fill: hasFill ? fill! : 'transparent',
        stroke: hasLine ? lineColor! : 'transparent',
        strokeWidth: hasLine ? lineW : 0,
        radius: kind === 'roundRect' ? Math.min(base.w, base.h) * 0.1667 : 0,
      }),
    );
  }
  if (text?.html) {
    const pad = num(at(bodyPr, 'lIns'), 91440) * ctx.k;
    const t = makeText(base.x, base.y, base.w, base.h, text.html, {
      fontFamily: text.font ?? (isTitle ? 'theme:heading' : 'theme:body'),
      fontSize: Math.round(text.size * ctx.pxPerPt),
      color: text.color ?? 'theme:text',
      bold: text.bold,
      italic: text.italic,
      align: text.align,
      valign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
      lineHeight: 1.15,
    });
    t.autoHeight = false;
    t.padding = Math.round(pad);
    t.rotation = rotation;
    if (plainBox && hasFill && !hasLine) t.fill = fill!;
    out.push(t);
  }
}

function readChart(doc: Document, scheme: Scheme): { type: ChartType; data: ChartData; title: string; legend: boolean; colors: string[]; showValues: boolean } | null {
  const plot = desc(doc, 'plotArea')[0];
  if (!plot) return null;
  const typeEl = Array.from(plot.children).find((c) => /Chart$/.test(c.localName));
  if (!typeEl) return null;
  const ln = typeEl.localName;
  let type: ChartType = 'column';
  if (ln.startsWith('bar')) type = at(kid(typeEl, 'barDir'), 'val') === 'bar' ? 'bar' : 'column';
  else if (ln.startsWith('line') || ln.startsWith('scatter')) type = 'line';
  else if (ln.startsWith('area')) type = 'area';
  else if (ln.startsWith('doughnut')) type = 'doughnut';
  else if (ln.startsWith('pie')) type = 'pie';
  const pts = (el: Element | undefined) => {
    const arr: string[] = [];
    for (const pt of desc(el, 'pt')) arr[num(at(pt, 'idx'))] = kid(pt, 'v')?.textContent ?? '';
    return arr;
  };
  const series = kids(typeEl, 'ser').map((ser, i) => ({
    name: desc(kid(ser, 'tx'), 'v')[0]?.textContent ?? `Series ${i + 1}`,
    labels: pts(kid(ser, 'cat')),
    values: pts(kid(ser, 'val')).map((v) => num(v)),
  }));
  if (!series.length) return null;
  const labels = series[0].labels.length ? series[0].labels.map((l) => l ?? '') : series[0].values.map((_, i) => String(i + 1));
  const title = desc(kid(desc(doc, 'chart')[0], 'title'), 't')
    .map((t) => t.textContent)
    .join('');
  const sers = kids(typeEl, 'ser');
  const isPie = type === 'pie' || type === 'doughnut';
  // Series colours (or per-slice colours for pies) when the file states them.
  const colors = (isPie ? kids(sers[0], 'dPt').map((d) => kid(d, 'spPr')) : sers.map((sr) => kid(sr, 'spPr')))
    .map((sp) => fillOf(sp, scheme))
    .map((c) => (c && c !== 'transparent' ? c : ''));
  const showValues = desc(typeEl, 'showVal').some((e) => at(e, 'val') === '1') || desc(typeEl, 'showPercent').some((e) => at(e, 'val') === '1');
  return {
    type,
    data: { labels, series: series.map((s) => ({ name: s.name, values: labels.map((_, i) => s.values[i] ?? 0) })) },
    title,
    legend: desc(doc, 'legend').length > 0,
    colors: colors.every((c) => !c) ? [] : colors.map((c, i) => c || ['theme:primary', 'theme:accent', 'theme:secondary'][i % 3]),
    showValues,
  };
}

function backgroundOf(doc: Document | undefined, ctx: Ctx, assetFor: (rid: string) => Promise<string | null>): Promise<Background | null> | Background | null {
  if (!doc) return null;
  const bgPr = desc(doc, 'bgPr')[0];
  if (!bgPr) {
    const ref = desc(doc, 'bgRef')[0];
    const c = colorChoice(ref, ctx.scheme);
    return c ? { kind: 'solid', color: c } : null;
  }
  const solid = kid(bgPr, 'solidFill');
  if (solid) {
    const c = colorChoice(solid, ctx.scheme);
    return c ? { kind: 'solid', color: c } : null;
  }
  const grad = kid(bgPr, 'gradFill');
  if (grad) {
    const stops = desc(grad, 'gs');
    const from = colorChoice(stops[0], ctx.scheme);
    const to = colorChoice(stops[stops.length - 1], ctx.scheme);
    const ang = num(at(kid(grad, 'lin'), 'ang'), 5400000) / 60000;
    if (from && to) return { kind: 'gradient', from, to, angle: ang + 90 };
  }
  const blip = desc(kid(bgPr, 'blipFill'), 'blip')[0];
  const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
  if (rid) return assetFor(rid).then((id) => (id ? { kind: 'image', assetId: id, dim: 0 } : null));
  return null;
}

export async function importPptx(file: File): Promise<ImportReport> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(`${file.name} isn’t a valid .pptx file. Re-save it from PowerPoint as .pptx (not .ppt or .key) and try again.`);
  }
  const presPath = 'ppt/presentation.xml';
  const presXml = await zip.file(presPath)?.async('string');
  if (!presXml) throw new Error(`${file.name} has no slides part, so it isn’t a PowerPoint presentation.`);
  const pres = parseXml(presXml);
  const presRels = await readRels(zip, presPath);
  const sz = desc(pres, 'sldSz')[0];
  const cx = num(at(sz, 'cx'), 12192000);
  const cy = num(at(sz, 'cy'), 6858000);
  const W = cx >= cy ? 1920 : Math.round((1920 * cx) / cy);
  const H = Math.round((W * cy) / cx);
  const k = W / cx;

  // Theme colours and fonts.
  const scheme: Scheme = {};
  let majorFont = 'Inter';
  let minorFont = 'Inter';
  const themeRel = relByType(presRels, '/theme');
  const themeXml = themeRel ? await zip.file(themeRel.target)?.async('string') : undefined;
  if (themeXml) {
    const t = parseXml(themeXml);
    const cs = desc(t, 'clrScheme')[0];
    for (const c of Array.from(cs?.children ?? [])) {
      const v = colorChoice(c, {});
      if (v) scheme[c.localName] = v;
    }
    majorFont = at(kid(desc(t, 'majorFont')[0], 'latin'), 'typeface') || majorFont;
    minorFont = at(kid(desc(t, 'minorFont')[0], 'latin'), 'typeface') || minorFont;
  }
  const base = THEME_PRESETS.find((t) => t.id === 'graphite')!;
  const theme = {
    ...structuredClone(base),
    id: 'imported',
    name: 'Imported',
    colors: {
      background: scheme.lt1 ?? '#ffffff',
      surface: scheme.lt2 ?? '#eeeeee',
      text: scheme.dk1 ?? '#111111',
      muted: scheme.dk2 ?? '#555555',
      primary: scheme.accent1 ?? '#3a6ea5',
      secondary: scheme.accent2 ?? '#c0504d',
      accent: scheme.accent3 ?? '#9bbb59',
    },
    fonts: { heading: majorFont, body: minorFont },
  };

  const title = file.name.replace(/\.pptx$/i, '');
  const deck = makeDeck(title, theme, { w: W, h: H, preset: W > H * 1.7 ? '16:9' : W > H ? '4:3' : 'custom' }, 'minimal');
  const ctx: Ctx = { zip, k, pxPerPt: W / (cx / EMU_PER_PT), scheme, majorFont, minorFont, titleSz: 44, bodySz: 24, otherSz: 18, assets: {}, skipped: new Set() };

  const slideIds = desc(pres, 'sldId').map((s) => s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? at(s, 'r:id'));
  const slidePaths = slideIds.map((id) => (id ? presRels.get(id)?.target : undefined)).filter((p): p is string => !!p);
  if (!slidePaths.length) throw new Error(`${file.name} has no slides.`);

  let masterSizesRead = false;
  for (const path of slidePaths) {
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const slideDoc = parseXml(xml);
    const rels = await readRels(zip, path);
    const layoutRel = relByType(rels, '/slideLayout');
    const layoutXml = layoutRel ? await zip.file(layoutRel.target)?.async('string') : undefined;
    const layoutDoc = layoutXml ? parseXml(layoutXml) : undefined;
    let masterDoc: Document | undefined;
    let masterRels = new Map<string, Rel>();
    let layoutRels = new Map<string, Rel>();
    if (layoutRel) {
      layoutRels = await readRels(zip, layoutRel.target);
      const mRel = relByType(layoutRels, '/slideMaster');
      const mXml = mRel ? await zip.file(mRel.target)?.async('string') : undefined;
      if (mXml && mRel) {
        masterDoc = parseXml(mXml);
        masterRels = await readRels(zip, mRel.target);
      }
    }
    if (masterDoc && !masterSizesRead) {
      masterSizesRead = true;
      const sizeIn = (styleName: string) => num(at(kid(kid(desc(masterDoc, styleName)[0], 'lvl1pPr'), 'defRPr'), 'sz'), 0) / 100;
      ctx.titleSz = sizeIn('titleStyle') || 44;
      ctx.bodySz = sizeIn('bodyStyle') || 24;
      ctx.otherSz = sizeIn('otherStyle') || 18;
    }

    const parts: SlideParts = { slide: slideDoc, layout: layoutDoc, master: masterDoc, rels, path };
    const elements: SlideElement[] = [];
    const tree = desc(slideDoc, 'spTree')[0];
    for (const c of Array.from(tree?.children ?? [])) await convertShape(c, parts, ctx, (b) => b, elements);

    const assetFrom = (relMap: Map<string, Rel>) => async (rid: string) => {
      const r = relMap.get(rid);
      return r ? loadMedia(ctx, r.target) : null;
    };
    const bg =
      (await backgroundOf(slideDoc, ctx, assetFrom(rels))) ??
      (await backgroundOf(layoutDoc, ctx, assetFrom(layoutRels))) ??
      (await backgroundOf(masterDoc, ctx, assetFrom(masterRels))) ?? { kind: 'solid' as const, color: 'theme:background' };

    let notes = '';
    const notesRel = relByType(rels, '/notesSlide');
    const notesXml = notesRel ? await zip.file(notesRel.target)?.async('string') : undefined;
    if (notesXml) {
      const nd = parseXml(notesXml);
      const body = desc(nd, 'sp').find((s) => phOf(s)?.type === 'body');
      if (body) notes = desc(body, 'p').map((p) => desc(p, 't').map((t) => t.textContent).join('')).join('\n').trim();
    }

    // Charts and default-coloured text should read against this slide's background.
    const bgHex = bg.kind === 'solid' ? (bg.color.startsWith('theme:') ? theme.colors.background : bg.color) : null;
    if (bgHex) {
      const readable = contrastRatio(theme.colors.text, bgHex) >= contrastRatio(theme.colors.background, bgHex) ? 'theme:text' : 'theme:background';
      for (const e of elements) {
        if (e.type === 'chart') e.textColor = readable;
        if (e.type === 'text' && e.style.color === 'theme:text') e.style.color = readable;
        if (e.type === 'table' && e.style.color === 'theme:text') e.style.color = readable;
      }
    }

    const slide: Slide = {
      id: uid(),
      layoutId: 'blank',
      elements,
      background: bg,
      notes,
      transition: 'fade',
      hidden: at(slideDoc.documentElement, 'show') === '0' || undefined,
    };
    deck.slides.push(slide);
  }
  deck.assets = ctx.assets;
  return { deck, skipped: [...ctx.skipped] };
}
