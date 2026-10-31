import type { Draft } from 'immer';
import {
  checkpoint,
  currentElements,
  currentSlide,
  draftElements,
  mutate,
  setToast,
  useEditor,
} from './editor';
import {
  cloneElement,
  cloneSlide,
  makeChart,
  makeImage,
  makeShape,
  makeSlide,
  makeTable,
  makeText,
  paragraphs,
  uid,
} from '../model/factory';
import { aabb, getLayout, resolveElement, unionBox } from '../model/resolve';
import type {
  Asset,
  ChartType,
  Deck,
  Layout,
  ShapeKind,
  SlideElement,
  Theme,
  ThemeColorKey,
} from '../model/types';

const S = () => useEditor.getState();

// ---------- selection ----------

export function selectElement(id: string, additive = false) {
  const els = currentElements();
  const el = els.find((e) => e.id === id);
  if (!el) return;
  const ids = el.groupId ? els.filter((e) => e.groupId === el.groupId).map((e) => e.id) : [id];
  const sel = S().selection;
  if (additive) {
    const has = ids.every((i) => sel.includes(i));
    useEditor.setState({ selection: has ? sel.filter((i) => !ids.includes(i)) : [...sel, ...ids.filter((i) => !sel.includes(i))], editingId: null });
  } else if (!ids.every((i) => sel.includes(i))) {
    // Clicking an element already inside a multi-selection keeps the selection (so it can be dragged).
    useEditor.setState({ selection: ids, editingId: null });
  }
  if (S().panel !== 'selection' && S().panel !== 'check') useEditor.setState({ panel: 'selection' });
}

export function setSelection(ids: string[]) {
  useEditor.setState({ selection: ids, editingId: ids.includes(S().editingId ?? '') ? S().editingId : null });
}

export function clearSelection() {
  useEditor.setState({ selection: [], editingId: null });
}

export function selectAll() {
  useEditor.setState({ selection: currentElements().filter((e) => !e.locked).map((e) => e.id), editingId: null });
}

export function goToSlide(id: string) {
  useEditor.setState({ slideId: id, selection: [], editingId: null, target: { kind: 'slide' } });
}

// ---------- element edits ----------

type Touch = 'geom' | 'style';

function currentLayout(d: Deck | Draft<Deck>): Layout | undefined {
  const s = S();
  if (s.target.kind === 'layout') return undefined;
  const slide = d.slides.find((x) => x.id === s.slideId) ?? d.slides[0];
  return slide ? (getLayout(d as Deck, slide.layoutId) as Layout) : undefined;
}

/** Breaks the link to the layout for the touched aspects, copying the inherited values first. */
function detach(el: Draft<SlideElement>, layout: Layout | undefined, touches: Touch[]) {
  if (!el.ph || !layout) return;
  const resolved = resolveElement(el as SlideElement, layout);
  if (touches.includes('geom') && el.ph.geom) {
    el.x = resolved.x;
    el.y = resolved.y;
    el.w = resolved.w;
    el.h = resolved.h;
    el.rotation = resolved.rotation;
    el.ph.geom = false;
  }
  if (touches.includes('style') && el.ph.style) {
    if (el.type === 'text' && resolved.type === 'text') {
      el.style = { ...resolved.style };
      el.fill = resolved.fill;
      el.padding = resolved.padding;
      el.autoHeight = resolved.autoHeight;
    }
    if (el.type === 'image' && resolved.type === 'image') {
      el.fit = resolved.fit;
      el.radius = resolved.radius;
    }
    el.ph.style = false;
  }
}

export function editElements(ids: string[], fn: (el: Draft<SlideElement>) => void, opts: { history?: boolean; touches?: Touch[] } = {}) {
  if (!ids.length) return;
  mutate((d) => {
    const layout = currentLayout(d);
    for (const el of draftElements(d)) {
      if (!ids.includes(el.id)) continue;
      if (opts.touches?.length) detach(el, layout, opts.touches);
      fn(el);
    }
  }, opts.history ?? true);
}

export function editSelected(fn: (el: Draft<SlideElement>) => void, opts: { history?: boolean; touches?: Touch[] } = {}) {
  editElements(S().selection, fn, opts);
}

/** Re-links an element to its layout placeholder (undo a manual override). */
export function resetToLayout(ids: string[]) {
  mutate((d) => {
    for (const el of draftElements(d)) {
      if (ids.includes(el.id) && el.ph) {
        el.ph.geom = true;
        el.ph.style = true;
      }
    }
  });
}

export function addElements(els: SlideElement[], select = true) {
  mutate((d) => {
    draftElements(d).push(...(els as Draft<SlideElement>[]));
  });
  if (select) useEditor.setState({ selection: els.map((e) => e.id), editingId: null, panel: 'selection' });
}

export function deleteSelection() {
  const ids = S().selection;
  if (!ids.length) return;
  mutate((d) => {
    const arr = draftElements(d);
    for (let i = arr.length - 1; i >= 0; i--) if (ids.includes(arr[i].id) && !arr[i].locked) arr.splice(i, 1);
  });
  useEditor.setState({ selection: [], editingId: null });
}

function resolvedSelection(): SlideElement[] {
  const s = S();
  if (!s.deck) return [];
  const slide = currentSlide();
  const layout = s.target.kind === 'slide' && slide ? getLayout(s.deck, slide.layoutId) : undefined;
  return currentElements()
    .filter((e) => s.selection.includes(e.id))
    .map((e) => resolveElement(e, layout));
}

function detachedCopies(els: SlideElement[], dx: number, dy: number): SlideElement[] {
  const groupMap = new Map<string, string>();
  return els.map((e) => {
    const c = cloneElement(e, dx, dy);
    delete c.ph;
    delete c.placeholder;
    delete c.prompt;
    if (e.groupId) {
      if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, uid());
      c.groupId = groupMap.get(e.groupId);
    }
    return c;
  });
}

export function duplicateSelection() {
  const els = resolvedSelection();
  if (!els.length) return;
  addElements(detachedCopies(els, 30, 30));
}

export function copySelection(cut = false) {
  const s = S();
  const els = resolvedSelection();
  if (!els.length || !s.deck) return;
  const assets: Record<string, Asset> = {};
  for (const e of els) if (e.type === 'image' && s.deck.assets[e.assetId]) assets[e.assetId] = s.deck.assets[e.assetId];
  useEditor.setState({ clipboard: { elements: structuredClone(els), assets } });
  if (cut) deleteSelection();
}

export function pasteClipboard() {
  const clip = S().clipboard;
  if (!clip) return false;
  mutate((d) => {
    for (const [id, a] of Object.entries(clip.assets)) if (!d.assets[id]) d.assets[id] = a;
  });
  const sameSlide = clip.elements.every((e) => currentElements().some((c) => c.id === e.id));
  addElements(detachedCopies(clip.elements, sameSlide ? 30 : 0, sameSlide ? 30 : 0));
  return true;
}

export function nudge(dx: number, dy: number) {
  const s = S();
  const ids = s.selection.filter((id) => !currentElements().find((e) => e.id === id)?.locked);
  editElements(ids, (el) => {
    el.x += dx;
    el.y += dy;
  }, { touches: ['geom'] });
}

export function reorder(dir: 'forward' | 'backward' | 'front' | 'back') {
  const ids = S().selection;
  if (!ids.length) return;
  mutate((d) => {
    const arr = draftElements(d);
    const picked = arr.filter((e) => ids.includes(e.id));
    if (dir === 'front' || dir === 'back') {
      const rest = arr.filter((e) => !ids.includes(e.id));
      const next = dir === 'front' ? [...rest, ...picked] : [...picked, ...rest];
      arr.splice(0, arr.length, ...next);
      return;
    }
    if (dir === 'forward') {
      for (let i = arr.length - 2; i >= 0; i--) {
        if (ids.includes(arr[i].id) && !ids.includes(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    } else {
      for (let i = 1; i < arr.length; i++) {
        if (ids.includes(arr[i].id) && !ids.includes(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
  });
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function align(mode: AlignMode) {
  const s = S();
  if (!s.deck) return;
  const els = resolvedSelection();
  if (!els.length) return;
  const ref = els.length === 1 ? { x: 0, y: 0, w: s.deck.size.w, h: s.deck.size.h } : unionBox(els.map(aabb))!;
  const boxes = new Map(els.map((e) => [e.id, aabb(e)]));
  editElements(els.map((e) => e.id), (el) => {
    const b = boxes.get(el.id)!;
    if (mode === 'left') el.x += ref.x - b.x;
    if (mode === 'right') el.x += ref.x + ref.w - (b.x + b.w);
    if (mode === 'hcenter') el.x += ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (mode === 'top') el.y += ref.y - b.y;
    if (mode === 'bottom') el.y += ref.y + ref.h - (b.y + b.h);
    if (mode === 'vcenter') el.y += ref.y + ref.h / 2 - (b.y + b.h / 2);
  }, { touches: ['geom'] });
}

export function distribute(axis: 'h' | 'v') {
  const els = resolvedSelection();
  if (els.length < 3) return;
  const boxes = els.map((e) => ({ id: e.id, b: aabb(e) }));
  boxes.sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = boxes[0].b;
  const last = boxes[boxes.length - 1].b;
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const total = boxes.reduce((acc, x) => acc + (axis === 'h' ? x.b.w : x.b.h), 0);
  const gap = (span - total) / (boxes.length - 1);
  const targets = new Map<string, number>();
  let cursor = axis === 'h' ? first.x : first.y;
  for (const x of boxes) {
    targets.set(x.id, cursor - (axis === 'h' ? x.b.x : x.b.y));
    cursor += (axis === 'h' ? x.b.w : x.b.h) + gap;
  }
  editElements(els.map((e) => e.id), (el) => {
    const delta = targets.get(el.id) ?? 0;
    if (axis === 'h') el.x += delta;
    else el.y += delta;
  }, { touches: ['geom'] });
}

export function groupSelection() {
  const ids = S().selection;
  if (ids.length < 2) return;
  const g = uid();
  editElements(ids, (el) => {
    el.groupId = g;
  });
  setToast('Grouped');
}

export function ungroupSelection() {
  editElements(S().selection, (el) => {
    delete el.groupId;
  });
  setToast('Ungrouped');
}

export function toggleLock() {
  const els = currentElements().filter((e) => S().selection.includes(e.id));
  const lock = !els.every((e) => e.locked);
  editElements(els.map((e) => e.id), (el) => {
    el.locked = lock;
  });
}

// ---------- insert ----------

function insertBox(wFrac: number, hFrac: number) {
  const d = S().deck!;
  const w = d.size.w * wFrac;
  const h = d.size.h * hFrac;
  return { x: (d.size.w - w) / 2, y: (d.size.h - h) / 2, w, h };
}

const scaleU = () => Math.min(S().deck!.size.w, S().deck!.size.h) / 1080;

export function insertText(kind: 'heading' | 'body' = 'body') {
  if (!S().deck) return;
  const u = scaleU();
  const b = insertBox(0.5, 0.1);
  const el =
    kind === 'heading'
      ? makeText(b.x, b.y, b.w, 120 * u, paragraphs('Add a heading'), { fontFamily: 'theme:heading', fontSize: Math.round(80 * u), bold: true, lineHeight: 1.1 })
      : makeText(b.x, b.y, b.w, 60 * u, paragraphs('Add some text'), { fontSize: Math.round(40 * u) });
  addElements([el]);
  useEditor.setState({ editingId: el.id });
}

export function insertShape(kind: ShapeKind) {
  if (!S().deck) return;
  const u = scaleU();
  const size = 320 * u;
  const d = S().deck!;
  const isLine = kind === 'line' || kind === 'arrow';
  const el = makeShape(kind, (d.size.w - size) / 2, (d.size.h - (isLine ? 24 * u : size)) / 2, isLine ? size * 1.4 : size, isLine ? 24 * u : size);
  addElements([el]);
}

export function insertChart(type: ChartType) {
  if (!S().deck) return;
  const b = insertBox(0.6, 0.6);
  const el = makeChart(type, b.x, b.y, b.w, b.h);
  addElements([el]);
  useEditor.setState({ dialog: 'chart', chartEditId: el.id });
}

export function insertTable(rows = 4, cols = 3) {
  if (!S().deck) return;
  const b = insertBox(0.7, 0.5);
  const data = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Heading ${c + 1}` : '')));
  addElements([makeTable(data, b.x, b.y, b.w, b.h)]);
}

export async function fileToAsset(file: File): Promise<Asset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  let w = img.naturalWidth || 800;
  let h = img.naturalHeight || 600;
  const max = 2400;
  let url = dataUrl;
  if (!file.type.includes('svg') && (w > max || h > max || file.size > 1.5e6)) {
    const k = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * k);
    h = Math.round(h * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    url = file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
  }
  return { id: uid(), dataUrl: url, w, h, name: file.name };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

export function addAsset(asset: Asset): string {
  const d = S().deck;
  if (!d) return asset.id;
  const existing = Object.values(d.assets).find((a) => a.dataUrl === asset.dataUrl);
  if (existing) return existing.id;
  mutate((dd) => {
    dd.assets[asset.id] = asset;
  }, false);
  return asset.id;
}

export async function insertImageFiles(files: File[], at?: { x: number; y: number }) {
  const d = S().deck;
  if (!d) return;
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    setToast('That file is not an image. Use PNG, JPG, GIF, WebP or SVG.');
    return;
  }
  checkpoint();
  const created: SlideElement[] = [];
  for (const f of imgs) {
    try {
      const asset = await fileToAsset(f);
      const id = addAsset(asset);
      // Drop onto an empty image placeholder if one is under the pointer or selected.
      const target = findImagePlaceholder(at);
      if (target) {
        editElements([target], (el) => {
          if (el.type === 'image') el.assetId = id;
        }, { history: false });
        useEditor.setState({ selection: [target] });
        continue;
      }
      const maxW = d.size.w * 0.5;
      const maxH = d.size.h * 0.6;
      const k = Math.min(maxW / asset.w, maxH / asset.h, 1.5);
      const w = asset.w * k;
      const h = asset.h * k;
      const x = at ? at.x - w / 2 : (d.size.w - w) / 2 + created.length * 30;
      const y = at ? at.y - h / 2 : (d.size.h - h) / 2 + created.length * 30;
      created.push(makeImage(id, x, y, w, h, { alt: '' }));
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  if (created.length) {
    mutate((dd) => {
      draftElements(dd).push(...(created as Draft<SlideElement>[]));
    }, false);
    useEditor.setState({ selection: created.map((c) => c.id), panel: 'selection' });
  }
}

function findImagePlaceholder(at?: { x: number; y: number }): string | null {
  const s = S();
  const slide = currentSlide();
  if (!s.deck || !slide || s.target.kind !== 'slide') return null;
  const layout = getLayout(s.deck, slide.layoutId);
  const els = slide.elements.map((e) => resolveElement(e, layout));
  const empty = els.filter((e) => e.type === 'image' && !e.assetId);
  if (at) {
    const hit = empty.find((e) => at.x >= e.x && at.x <= e.x + e.w && at.y >= e.y && at.y <= e.y + e.h);
    if (hit) return hit.id;
    return null;
  }
  const selected = empty.find((e) => s.selection.includes(e.id));
  return selected?.id ?? null;
}

export async function replaceImage(id: string, file: File) {
  const asset = await fileToAsset(file);
  checkpoint();
  const aid = addAsset(asset);
  editElements([id], (el) => {
    if (el.type === 'image') el.assetId = aid;
  }, { history: false });
}

// ---------- slides ----------

export function addSlide(layoutId: string, afterId?: string | null) {
  const d = S().deck;
  if (!d) return;
  const layout = getLayout(d, layoutId);
  const slide = makeSlide(layout);
  mutate((dd) => {
    const idx = afterId ? dd.slides.findIndex((s) => s.id === afterId) : dd.slides.length - 1;
    dd.slides.splice(idx + 1, 0, slide);
  });
  goToSlide(slide.id);
}

export function duplicateSlide(id: string) {
  const d = S().deck;
  const src = d?.slides.find((s) => s.id === id);
  if (!src) return;
  const copy = cloneSlide(src);
  mutate((dd) => {
    const idx = dd.slides.findIndex((s) => s.id === id);
    dd.slides.splice(idx + 1, 0, copy);
  });
  goToSlide(copy.id);
}

export function deleteSlide(id: string) {
  const d = S().deck;
  if (!d) return;
  if (d.slides.length <= 1) {
    setToast('A deck needs at least one slide.');
    return;
  }
  const idx = d.slides.findIndex((s) => s.id === id);
  mutate((dd) => {
    dd.slides.splice(idx, 1);
  });
  const next = S().deck!.slides[Math.min(idx, S().deck!.slides.length - 1)];
  goToSlide(next.id);
}

export function moveSlide(id: string, toIndex: number) {
  mutate((dd) => {
    const from = dd.slides.findIndex((s) => s.id === id);
    if (from < 0) return;
    const [s] = dd.slides.splice(from, 1);
    dd.slides.splice(Math.max(0, Math.min(dd.slides.length, toIndex)), 0, s);
  });
}

/** Switches a slide to another layout, carrying content across by placeholder kind. */
export function changeLayout(slideId: string, layoutId: string) {
  const d = S().deck;
  if (!d) return;
  mutate((dd) => {
    const slide = dd.slides.find((s) => s.id === slideId);
    if (!slide) return;
    const oldLayout = getLayout(dd as Deck, slide.layoutId);
    const newLayout = getLayout(dd as Deck, layoutId);
    const fresh = makeSlide(newLayout);
    const kindOf = (el: SlideElement) => oldLayout.elements.find((l) => l.id === el.ph?.ref)?.placeholder;
    const used = new Set<string>();
    const kept: SlideElement[] = [];
    for (const el of slide.elements as SlideElement[]) {
      if (!el.ph) {
        kept.push(el);
        continue;
      }
      const kind = kindOf(el);
      const match = fresh.elements.find((f) => !used.has(f.id) && newLayout.elements.find((l) => l.id === f.ph?.ref)?.placeholder === kind && f.type === el.type);
      if (match) {
        used.add(match.id);
        if (match.type === 'text' && el.type === 'text') match.html = el.html;
        if (match.type === 'image' && el.type === 'image') match.assetId = el.assetId;
        if (!el.ph.style && match.ph && el.type === 'text' && match.type === 'text') {
          match.style = el.style;
          match.ph.style = false;
        }
      } else {
        const resolved = resolveElement(el, oldLayout);
        const hasContent = (resolved.type === 'text' && resolved.html.replace(/<[^>]*>/g, '').trim()) || (resolved.type === 'image' && resolved.assetId);
        if (hasContent) kept.push({ ...resolved, ph: undefined });
      }
    }
    slide.layoutId = layoutId;
    slide.elements = [...fresh.elements, ...kept] as Draft<SlideElement>[];
  });
  useEditor.setState({ selection: [], editingId: null });
}

// ---------- theme / brand kit ----------

export function applyThemePreset(theme: Theme) {
  mutate((d) => {
    const logo = d.theme.logoAssetId;
    d.theme = { ...structuredClone(theme), logoAssetId: logo };
  });
}

export function setThemeColor(key: ThemeColorKey, hex: string, history = true) {
  mutate((d) => {
    d.theme.colors[key] = hex;
    d.theme.id = 'custom';
  }, history);
}

export function setThemeFont(role: 'heading' | 'body', name: string) {
  mutate((d) => {
    d.theme.fonts[role] = name;
    d.theme.id = 'custom';
  });
}

export async function setLogo(file: File | null) {
  if (!file) {
    mutate((d) => {
      delete d.theme.logoAssetId;
    });
    return;
  }
  const asset = await fileToAsset(file);
  checkpoint();
  const id = addAsset(asset);
  mutate((d) => {
    d.theme.logoAssetId = id;
  }, false);
}

export function enterLayoutEditing(layoutId: string) {
  useEditor.setState({ target: { kind: 'layout', layoutId }, selection: [], editingId: null, panel: 'selection' });
}

export function exitLayoutEditing() {
  useEditor.setState({ target: { kind: 'slide' }, selection: [], editingId: null });
}

export function renameDeck(title: string) {
  mutate((d) => {
    d.title = title;
  }, false);
}
