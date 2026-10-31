import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { checkpoint, currentElements, currentSlide, useEditor } from '../store/editor';
import {
  clearSelection,
  deleteSelection,
  editElements,
  insertImageFiles,
  replaceImage,
  selectElement,
  setSelection,
} from '../store/actions';
import { aabb, getLayout, intersects, isEmptyHtml, resolveElement, unionBox, type Box } from '../model/resolve';
import type { SlideElement, TableElement, TextElement } from '../model/types';
import { SlideView } from '../render/SlideView';
import { scaleInlineFontSizes, forgetSelection } from '../render/richtext';
import { snapBox, snapEdge } from './snap';
import { ELEMENT_DRAG_TYPE, insertLibraryElement } from '../studio/library';

type Session =
  | { kind: 'move'; start: { x: number; y: number }; origin: Map<string, { x: number; y: number }>; startBox: Box; moved: boolean }
  | { kind: 'resize'; start: { x: number; y: number }; hx: number; hy: number; el0: SlideElement; moved: boolean }
  | { kind: 'rotate'; center: { x: number; y: number }; a0: number; el0: SlideElement; moved: boolean }
  | { kind: 'marquee'; start: { x: number; y: number }; base: string[] };

function resolvedCurrent(): SlideElement[] {
  const s = useEditor.getState();
  const d = s.deck;
  if (!d) return [];
  if (s.target.kind === 'layout') return currentElements(s);
  const sl = currentSlide(s);
  if (!sl) return [];
  const lay = getLayout(d, sl.layoutId);
  return sl.elements.map((e) => resolveElement(e, lay));
}

const HANDLES: { hx: number; hy: number; cursor: string }[] = [
  { hx: -1, hy: -1, cursor: 'nwse-resize' },
  { hx: 0, hy: -1, cursor: 'ns-resize' },
  { hx: 1, hy: -1, cursor: 'nesw-resize' },
  { hx: 1, hy: 0, cursor: 'ew-resize' },
  { hx: 1, hy: 1, cursor: 'nwse-resize' },
  { hx: 0, hy: 1, cursor: 'ns-resize' },
  { hx: -1, hy: 1, cursor: 'nesw-resize' },
  { hx: -1, hy: 0, cursor: 'ew-resize' },
];

export function Canvas() {
  const deck = useEditor((s) => s.deck)!;
  const slideId = useEditor((s) => s.slideId);
  const target = useEditor((s) => s.target);
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const zoom = useEditor((s) => s.zoom);
  const guides = useEditor((s) => s.guides);

  const slide = deck.slides.find((s) => s.id === slideId) ?? deck.slides[0];
  const slideIndex = deck.slides.indexOf(slide);
  const layoutEditing = target.kind === 'layout' ? deck.layouts.find((l) => l.id === target.layoutId) : undefined;
  const layout = layoutEditing ?? getLayout(deck, slide.layoutId);
  const elements = layoutEditing ? layoutEditing.elements : slide.elements.map((e) => resolveElement(e, layout));

  const matRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const [matSize, setMatSize] = useState({ w: 900, h: 600 });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [liveSize, setLiveSize] = useState<string | null>(null);
  const session = useRef<Session | null>(null);

  const W = deck.size.w;
  const H = deck.size.h;
  const pad = 56;
  const fit = Math.max(0.03, Math.min((matSize.w - pad * 2) / W, (matSize.h - pad * 2) / H));
  const scale = zoom || fit;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useLayoutEffect(() => {
    const node = matRef.current!;
    const ro = new ResizeObserver(() => setMatSize({ w: node.clientWidth, h: node.clientHeight }));
    ro.observe(node);
    setMatSize({ w: node.clientWidth, h: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  const toLogical = useCallback((cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (cx - r.left) / scaleRef.current, y: (cy - r.top) / scaleRef.current };
  }, []);

  // ---------- pointer sessions ----------

  const onMove = useCallback(
    (ev: PointerEvent) => {
      const ss = session.current;
      if (!ss) return;
      const s = scaleRef.current;
      const p = toLogical(ev.clientX, ev.clientY);
      const d = useEditor.getState().deck!;
      const Wd = d.size.w;
      const Hd = d.size.h;
      if (ss.kind === 'move') {
        let dx = p.x - ss.start.x;
        let dy = p.y - ss.start.y;
        if (!ss.moved) {
          if (Math.hypot(dx, dy) * s < 3) return;
          ss.moved = true;
          checkpoint();
        }
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const moved = { ...ss.startBox, x: ss.startBox.x + dx, y: ss.startBox.y + dy };
        if (!ev.altKey) {
          const others = resolvedCurrent().filter((x) => !ss.origin.has(x.id)).map(aabb);
          const snap = snapBox(moved, others, Wd, Hd, 7 / s);
          dx += snap.dx;
          dy += snap.dy;
          useEditor.setState({ guides: snap.guides });
        } else useEditor.setState({ guides: [] });
        editElements(
          [...ss.origin.keys()],
          (el) => {
            const o = ss.origin.get(el.id)!;
            el.x = Math.round((o.x + dx) * 10) / 10;
            el.y = Math.round((o.y + dy) * 10) / 10;
          },
          { history: false, touches: ['geom'] },
        );
      } else if (ss.kind === 'resize') {
        const el0 = ss.el0;
        const wdx = p.x - ss.start.x;
        const wdy = p.y - ss.start.y;
        if (!ss.moved) {
          if (Math.hypot(wdx, wdy) * s < 2) return;
          ss.moved = true;
          checkpoint();
        }
        const th = (el0.rotation * Math.PI) / 180;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        const lx = wdx * cos + wdy * sin;
        const ly = -wdx * sin + wdy * cos;
        let w = el0.w + ss.hx * lx;
        let h = el0.h + ss.hy * ly;
        const corner = ss.hx !== 0 && ss.hy !== 0;
        const aspectDefault = el0.type === 'image' || el0.type === 'text';
        const keepAspect = corner && ev.shiftKey !== aspectDefault;
        if (keepAspect) {
          const k = Math.max(w / el0.w, h / el0.h);
          w = el0.w * k;
          h = el0.h * k;
        }
        const isLine = el0.type === 'shape' && (el0.shape === 'line' || el0.shape === 'arrow');
        w = Math.max(8, w);
        h = Math.max(isLine ? 2 : 8, h);
        const guidesOut: typeof guides = [];
        if (!el0.rotation && !ev.altKey && !keepAspect) {
          const others = resolvedCurrent().filter((x) => x.id !== el0.id).map(aabb);
          const t = 7 / s;
          if (ss.hx === 1) {
            const sn = snapEdge(el0.x + w, 'x', others, Wd, Hd, t);
            if (sn !== null) {
              w += sn;
              guidesOut.push({ axis: 'x', pos: el0.x + w, from: 0, to: Hd });
            }
          } else if (ss.hx === -1) {
            const sn = snapEdge(el0.x + el0.w - w, 'x', others, Wd, Hd, t);
            if (sn !== null) {
              w -= sn;
              guidesOut.push({ axis: 'x', pos: el0.x + el0.w - w, from: 0, to: Hd });
            }
          }
          if (ss.hy === 1) {
            const sn = snapEdge(el0.y + h, 'y', others, Wd, Hd, t);
            if (sn !== null) {
              h += sn;
              guidesOut.push({ axis: 'y', pos: el0.y + h, from: 0, to: Wd });
            }
          } else if (ss.hy === -1) {
            const sn = snapEdge(el0.y + el0.h - h, 'y', others, Wd, Hd, t);
            if (sn !== null) {
              h -= sn;
              guidesOut.push({ axis: 'y', pos: el0.y + el0.h - h, from: 0, to: Wd });
            }
          }
        }
        useEditor.setState({ guides: guidesOut });
        const clx = (ss.hx * (w - el0.w)) / 2;
        const cly = (ss.hy * (h - el0.h)) / 2;
        const cx = el0.x + el0.w / 2 + clx * cos - cly * sin;
        const cy = el0.y + el0.h / 2 + clx * sin + cly * cos;
        const k = w / el0.w;
        const scaleText = el0.type === 'text' && corner && keepAspect;
        setLiveSize(`${Math.round(w)} × ${Math.round(h)}`);
        editElements(
          [el0.id],
          (el) => {
            el.x = cx - w / 2;
            el.y = cy - h / 2;
            el.w = w;
            el.h = h;
            if (el.type === 'text' && el0.type === 'text') {
              if (scaleText) {
                el.style.fontSize = Math.max(6, Math.round(el0.style.fontSize * k));
                el.html = scaleInlineFontSizes(el0.html, k);
              } else if (ss.hy !== 0) el.autoHeight = false;
            }
          },
          { history: false, touches: scaleText ? ['geom', 'style'] : ['geom'] },
        );
      } else if (ss.kind === 'rotate') {
        const a = Math.atan2(p.y - ss.center.y, p.x - ss.center.x);
        if (!ss.moved) {
          ss.moved = true;
          checkpoint();
        }
        let deg = ss.el0.rotation + ((a - ss.a0) * 180) / Math.PI;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else {
          const near = Math.round(deg / 90) * 90;
          if (Math.abs(deg - near) < 4) deg = near;
        }
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        setLiveSize(`${Math.round(deg)}°`);
        editElements([ss.el0.id], (el) => {
          el.rotation = Math.round(deg * 10) / 10;
        }, { history: false, touches: ['geom'] });
      } else if (ss.kind === 'marquee') {
        const r = { x: Math.min(ss.start.x, p.x), y: Math.min(ss.start.y, p.y), w: Math.abs(p.x - ss.start.x), h: Math.abs(p.y - ss.start.y) };
        setMarquee(r);
        if (r.w * s > 3 || r.h * s > 3) {
          const hits = resolvedCurrent()
            .filter((e) => !e.locked && intersects(aabb(e), r))
            .map((e) => e.id);
          setSelection([...new Set([...ss.base, ...hits])]);
        }
      }
    },
    [toLogical],
  );

  const onUp = useCallback(() => {
    session.current = null;
    setMarquee(null);
    setLiveSize(null);
    useEditor.setState({ guides: [] });
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const begin = useCallback(
    (s: Session) => {
      session.current = s;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  useEffect(() => () => onUp(), [onUp]);

  const stopEditing = () => {
    const st = useEditor.getState();
    if (st.editingId) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      useEditor.setState({ editingId: null });
      forgetSelection();
    }
  };

  const onElementPointerDown = useCallback(
    (e: RPointerEvent, el: SlideElement) => {
      if (e.button !== 0) return;
      const st = useEditor.getState();
      if (st.editingId === el.id) return;
      e.stopPropagation();
      stopEditing();
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      selectElement(el.id, additive);
      if (additive) return;
      const sel = useEditor.getState().selection;
      const els = resolvedCurrent().filter((x) => sel.includes(x.id) && !x.locked);
      if (!els.length) return;
      const origin = new Map(els.map((x) => [x.id, { x: x.x, y: x.y }]));
      begin({ kind: 'move', start: toLogical(e.clientX, e.clientY), origin, startBox: unionBox(els.map(aabb))!, moved: false });
    },
    [begin, toLogical],
  );

  const onElementDoubleClick = useCallback((el: SlideElement) => {
    const st = useEditor.getState();
    if (el.locked) return;
    if (el.type === 'text') {
      if (st.target.kind === 'layout' && el.placeholder) return;
      useEditor.setState({ editingId: el.id, selection: [el.id] });
    } else if (el.type === 'table') {
      useEditor.setState({ editingId: el.id, selection: [el.id] });
    } else if (el.type === 'chart') {
      useEditor.setState({ dialog: 'chart', chartEditId: el.id, selection: [el.id] });
    } else if (el.type === 'image' && el.assetId !== 'theme:logo') {
      replaceTarget.current = el.id;
      fileRef.current?.click();
    }
  }, []);

  const onTextCommit = useCallback((el: TextElement, html: string) => {
    const st = useEditor.getState();
    if (st.editingId === el.id) useEditor.setState({ editingId: null });
    const current = currentElements().find((e) => e.id === el.id);
    if (!current || current.type !== 'text') return;
    const empty = isEmptyHtml(html);
    if (empty && !current.ph && !current.placeholder) {
      useEditor.setState({ selection: [el.id] });
      deleteSelection();
      return;
    }
    const next = empty ? '' : html;
    if (next === current.html) return;
    editElements([el.id], (e) => {
      if (e.type === 'text') e.html = next;
    });
  }, []);

  const onTextMeasure = useCallback((el: TextElement, h: number) => {
    if (!el.autoHeight) return;
    editElements([el.id], (e) => {
      e.h = Math.max(h, 10);
    }, { history: false });
  }, []);

  const onTableCommit = useCallback((el: TableElement, rows: string[][]) => {
    editElements([el.id], (e) => {
      if (e.type === 'table') e.rows = rows;
    });
  }, []);

  const onMatPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.el, .handle, .zoom-ctl')) return;
    stopEditing();
    const base = e.shiftKey ? useEditor.getState().selection : [];
    if (!e.shiftKey) clearSelection();
    begin({ kind: 'marquee', start: toLogical(e.clientX, e.clientY), base });
  };

  const startResize = (e: RPointerEvent, hx: number, hy: number) => {
    e.stopPropagation();
    e.preventDefault();
    const el0 = resolvedCurrent().find((x) => x.id === selection[0]);
    if (!el0) return;
    begin({ kind: 'resize', start: toLogical(e.clientX, e.clientY), hx, hy, el0: structuredClone(el0), moved: false });
  };

  const startRotate = (e: RPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el0 = resolvedCurrent().find((x) => x.id === selection[0]);
    if (!el0) return;
    const center = { x: el0.x + el0.w / 2, y: el0.y + el0.h / 2 };
    const p = toLogical(e.clientX, e.clientY);
    begin({ kind: 'rotate', center, a0: Math.atan2(p.y - center.y, p.x - center.x), el0: structuredClone(el0), moved: false });
  };

  // ---------- zoom ----------
  useEffect(() => {
    const node = matRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = useEditor.getState().zoom || scaleRef.current;
      const next = Math.max(0.05, Math.min(4, cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      useEditor.setState({ zoom: next });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const selected = elements.filter((e) => selection.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;
  const showHandles = single && !single.locked && editingId !== single.id;
  const isLine = single?.type === 'shape' && (single.shape === 'line' || single.shape === 'arrow');
  const textAuto = single?.type === 'text' && single.autoHeight;
  const handles = HANDLES.filter((h) => (isLine ? h.hy === 0 : textAuto ? h.hx !== 0 : true));
  const multiBox = selected.length > 1 ? unionBox(selected.map(aabb)) : null;

  const stageW = W * scale;
  const stageH = H * scale;

  return (
    <div className="mat-wrap">
    <div
      className="mat"
      ref={matRef}
      onPointerDown={onMatPointerDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(ELEMENT_DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        const elementData = e.dataTransfer.getData(ELEMENT_DRAG_TYPE);
        if (elementData) {
          e.preventDefault();
          try { const { id, color } = JSON.parse(elementData); if (typeof id === 'string' && /^#[0-9a-f]{6}$/i.test(color)) insertLibraryElement(id, color, toLogical(e.clientX, e.clientY)); } catch { /* ignore invalid drag data */ }
          return;
        }
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        e.preventDefault();
        insertImageFiles(files, toLogical(e.clientX, e.clientY));
      }}
    >
      <div className="mat-scroll" style={{ minWidth: stageW + pad * 2, minHeight: stageH + pad * 2 }}>
        <div className="stage" ref={stageRef} style={{ width: stageW, height: stageH, ['--scale' as string]: scale }}>
          {layoutEditing && <div className="layout-banner">Editing layout “{layoutEditing.name}”. Changes apply to every slide that uses it.</div>}
          <SlideView
            deck={deck}
            slide={layoutEditing ? null : slide}
            layout={layoutEditing}
            mode="edit"
            scale={scale}
            index={Math.max(0, slideIndex)}
            editingId={editingId}
            onElementPointerDown={onElementPointerDown}
            onElementDoubleClick={onElementDoubleClick}
            onTextCommit={onTextCommit}
            onTextMeasure={onTextMeasure}
            onTableCommit={onTableCommit}
          />
          <div className="overlay">
            {selected.map((el) => (
              <div
                key={el.id}
                className={`sel-box${el.locked ? ' locked' : ''}${editingId === el.id ? ' editing' : ''}`}
                style={{ left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.h * scale, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              >
                {showHandles && single?.id === el.id && (
                  <>
                    {handles.map((h) => (
                      <div
                        key={`${h.hx},${h.hy}`}
                        className={`handle${h.hx && h.hy ? ' corner' : ' side'}${h.hx === 0 ? ' hz' : ''}`}
                        style={{ left: `${((h.hx + 1) / 2) * 100}%`, top: `${((h.hy + 1) / 2) * 100}%`, cursor: h.cursor }}
                        onPointerDown={(e) => startResize(e, h.hx, h.hy)}
                      />
                    ))}
                    <div className="handle rotate" title="Rotate (Shift snaps to 15°)" onPointerDown={startRotate} />
                  </>
                )}
              </div>
            ))}
            {multiBox && <div className="multi-box" style={{ left: multiBox.x * scale, top: multiBox.y * scale, width: multiBox.w * scale, height: multiBox.h * scale }} />}
            {guides.map((g, i) =>
              g.axis === 'x' ? (
                <div key={i} className="guide v" style={{ left: g.pos * scale, top: g.from * scale, height: (g.to - g.from) * scale }} />
              ) : (
                <div key={i} className="guide h" style={{ top: g.pos * scale, left: g.from * scale, width: (g.to - g.from) * scale }} />
              ),
            )}
            {marquee && <div className="marquee" style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }} />}
            {liveSize && single && (
              <div className="live-size" style={{ left: (single.x + single.w / 2) * scale, top: (single.y + single.h) * scale + 14 }}>
                {liveSize}
              </div>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replaceTarget.current) replaceImage(replaceTarget.current, f);
          e.target.value = '';
        }}
      />
    </div>
      <div className="zoom-ctl" onPointerDown={(e) => e.stopPropagation()}>
        <button title="Zoom out" aria-label="Zoom out" onClick={() => useEditor.setState({ zoom: Math.max(0.05, scale / 1.2) })}>
          <Minus size={14} />
        </button>
        <button className="zoom-val" title="Fit to window" onClick={() => useEditor.setState({ zoom: 0 })}>
          {Math.round(scale * 100)}%
        </button>
        <button title="Zoom in" aria-label="Zoom in" onClick={() => useEditor.setState({ zoom: Math.min(4, scale * 1.2) })}>
          <Plus size={14} />
        </button>
        <button title="Fit to window" aria-label="Fit to window" onClick={() => useEditor.setState({ zoom: 0 })}>
          <Scan size={14} />
        </button>
      </div>
    </div>
  );
}
