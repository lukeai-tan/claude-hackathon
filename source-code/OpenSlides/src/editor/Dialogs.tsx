import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { mutate, setToast, useEditor } from '../store/editor';
import { editElements, enterLayoutEditing } from '../store/actions';
import { SIZE_PRESETS } from '../model/factory';
import { resizeDeck } from '../model/resize';
import { saveDeck } from '../store/storage';
import { navigate } from '../router';
import type { ChartData, ChartElement } from '../model/types';
import { ChartView } from '../render/ChartView';
import { LayoutThumb } from './SlidePanel';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  const close = () => useEditor.setState({ dialog: null, chartEditId: null });
  if (dialog === 'chart') return <ChartDialog onClose={close} />;
  if (dialog === 'resize') return <ResizeDialog onClose={close} />;
  if (dialog === 'layouts') return <LayoutsDialog onClose={close} />;
  if (dialog === 'shortcuts') return <ShortcutsDialog onClose={close} />;
  return null;
}

// ---------- chart data ----------

function parseNumber(s: string): number {
  const v = parseFloat(String(s).replace(/[,$%£€\s]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

/** Parses CSV or tab-separated text (as copied from Excel or Sheets) into chart data. */
export function parseTable(text: string): ChartData | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === delim && !q) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const rows = lines.map(split);
  const header = rows[0];
  const names = header.slice(1).map((n, i) => n || `Series ${i + 1}`);
  if (!names.length) return null;
  const labels = rows.slice(1).map((r) => r[0] ?? '');
  const series = names.map((name, si) => ({ name, values: rows.slice(1).map((r) => parseNumber(r[si + 1] ?? '')) }));
  return { labels, series };
}

function ChartDialog({ onClose }: { onClose: () => void }) {
  const deck = useEditor((s) => s.deck)!;
  const id = useEditor((s) => s.chartEditId);
  const target = useEditor((s) => s.target);
  const slideId = useEditor((s) => s.slideId);
  const el = useMemo(() => {
    const els = target.kind === 'layout' ? deck.layouts.find((l) => l.id === target.layoutId)?.elements : (deck.slides.find((s) => s.id === slideId) ?? deck.slides[0])?.elements;
    return els?.find((e) => e.id === id) as ChartElement | undefined;
  }, [deck, id, target, slideId]);
  const [data, setData] = useState<ChartData | null>(el ? structuredClone(el.data) : null);
  const [paste, setPaste] = useState('');
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  if (!el || !data) return null;
  const isPie = el.chartType === 'pie' || el.chartType === 'doughnut';

  const setCell = (ri: number, ci: number, v: string) => {
    const d = structuredClone(data);
    if (ci === 0) d.labels[ri] = v;
    else d.series[ci - 1].values[ri] = parseNumber(v);
    setData(d);
  };
  const addRow = () => setData({ labels: [...data.labels, `Item ${data.labels.length + 1}`], series: data.series.map((s) => ({ ...s, values: [...s.values, 0] })) });
  const removeRow = (ri: number) => setData({ labels: data.labels.filter((_, i) => i !== ri), series: data.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== ri) })) });
  const addSeries = () => setData({ ...data, series: [...data.series, { name: `Series ${data.series.length + 1}`, values: data.labels.map(() => 0) }] });
  const removeSeries = (si: number) => setData({ ...data, series: data.series.filter((_, i) => i !== si) });

  const apply = () => {
    editElements([el.id], (e) => {
      if (e.type === 'chart') e.data = data;
    });
    onClose();
  };

  return (
    <Modal title="Chart data" onClose={onClose} wide>
      <div className="chart-dialog">
        <div className="chart-grid-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Label</th>
                {data.series.map((s, si) => (
                  <th key={si}>
                    <input
                      value={s.name}
                      aria-label={`Series ${si + 1} name`}
                      onChange={(e) => {
                        const d = structuredClone(data);
                        d.series[si].name = e.target.value;
                        setData(d);
                      }}
                    />
                    {data.series.length > 1 && (
                      <button className="mini" title="Remove series" aria-label="Remove series" onClick={() => removeSeries(si)}>
                        <X size={12} />
                      </button>
                    )}
                  </th>
                ))}
                <th>
                  {!isPie && (
                    <button className="mini add" onClick={addSeries} title="Add a series">
                      <Plus size={13} />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.labels.map((l, ri) => (
                <tr key={ri}>
                  <td>
                    <input value={l} aria-label={`Label ${ri + 1}`} onChange={(e) => setCell(ri, 0, e.target.value)} />
                  </td>
                  {data.series.map((s, si) => (
                    <td key={si}>
                      <input className="num" inputMode="decimal" defaultValue={String(s.values[ri] ?? 0)} key={`${si}-${ri}-${s.values[ri]}`} aria-label={`${s.name}, ${l}`} onBlur={(e) => setCell(ri, si + 1, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <button className="mini" title="Remove row" aria-label="Remove row" onClick={() => removeRow(ri)} disabled={data.labels.length <= 1}>
                      <Minus size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn small ghost" onClick={addRow}>
            <Plus size={14} /> Add row
          </button>
          <details className="paste-box">
            <summary>Paste from a spreadsheet or CSV</summary>
            <textarea
              rows={5}
              value={paste}
              placeholder={'Month\tSales\tCosts\nJan\t120\t80\nFeb\t140\t90'}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteErr(null);
              }}
            />
            {pasteErr && <p className="error-text">{pasteErr}</p>}
            <button
              className="btn small"
              onClick={() => {
                const parsed = parseTable(paste);
                if (!parsed) {
                  setPasteErr('Need a header row (label, series names) and at least one data row.');
                  return;
                }
                setData(isPie ? { labels: parsed.labels, series: parsed.series.slice(0, 1) } : parsed);
                setPaste('');
              }}
            >
              Use pasted data
            </button>
          </details>
        </div>
        <div className="chart-preview">
          <div style={{ aspectRatio: `${el.w} / ${el.h}`, width: '100%', background: deck.theme.colors.background, borderRadius: 8, padding: 8, boxSizing: 'border-box' }}>
            <ChartView el={{ ...el, data }} theme={deck.theme} />
          </div>
          <p className="muted small">Exports to PowerPoint as a native chart you can keep editing there.</p>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={apply}>
          Apply data
        </button>
      </div>
    </Modal>
  );
}

// ---------- magic resize ----------

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const deck = useEditor((s) => s.deck)!;
  const [preset, setPreset] = useState(SIZE_PRESETS.find((p) => p.id !== deck.size.preset)?.id ?? '16:9');
  const [asCopy, setAsCopy] = useState(true);
  const p = SIZE_PRESETS.find((x) => x.id === preset)!;
  const run = async () => {
    const out = resizeDeck(deck, { w: p.w, h: p.h, preset: p.id }, asCopy);
    onClose();
    if (asCopy) {
      await saveDeck(out);
      setToast(`Created a ${p.label} copy`);
      navigate(`#/d/${out.id}`);
    } else {
      mutate((d) => {
        d.size = out.size;
        d.layouts = out.layouts as any;
        d.slides = out.slides as any;
      });
      useEditor.setState({ selection: [], zoom: 0 });
      setToast(`Resized to ${p.label}. Ctrl+Z undoes it.`);
    }
  };
  return (
    <Modal title="Resize for another format" onClose={onClose}>
      <p className="small">Positions, sizes and text re-fit to the new shape. Full-width items stay full-width. Check text-heavy slides afterwards.</p>
      <div className="size-grid">
        {SIZE_PRESETS.map((s) => (
          <button key={s.id} className={`size-opt${preset === s.id ? ' on' : ''}`} disabled={s.id === deck.size.preset} onClick={() => setPreset(s.id)}>
            <span className="size-shape" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
            <span>{s.label}</span>
            <span className="muted small">
              {s.w} × {s.h}
              {s.id === deck.size.preset ? ' (current)' : ''}
            </span>
          </button>
        ))}
      </div>
      <label className="radio">
        <input type="radio" checked={asCopy} onChange={() => setAsCopy(true)} /> Make a resized copy and keep this deck as it is
      </label>
      <label className="radio">
        <input type="radio" checked={!asCopy} onChange={() => setAsCopy(false)} /> Resize this deck
      </label>
      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={run}>
          Resize to {p.label}
        </button>
      </div>
    </Modal>
  );
}

// ---------- layouts ----------

function LayoutsDialog({ onClose }: { onClose: () => void }) {
  const deck = useEditor((s) => s.deck)!;
  return (
    <Modal title="Slide layouts" onClose={onClose} wide>
      <p className="small">Layouts are the masters behind your slides. Move a title or change its font here and every slide using that layout follows, unless you’ve changed that item on a particular slide.</p>
      <div className="layouts-grid">
        {deck.layouts.map((l) => {
          const uses = deck.slides.filter((s) => s.layoutId === l.id).length;
          return (
            <button
              key={l.id}
              className="layout-card"
              onClick={() => {
                onClose();
                enterLayoutEditing(l.id);
              }}
            >
              <div className="lc-thumb" style={{ height: (220 * deck.size.h) / deck.size.w }}>
                <LayoutThumb deck={deck} layout={l} width={220} />
              </div>
              <span className="lc-name">{l.name}</span>
              <span className="muted small">{uses ? `Used by ${uses} slide${uses === 1 ? '' : 's'}` : 'Not used yet'}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------- shortcuts ----------

const SHORTCUTS: [string, string][] = [
  ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'],
  ['Ctrl C / X / V', 'Copy, cut, paste items (works between decks)'],
  ['Ctrl D', 'Duplicate'],
  ['Ctrl G / Ctrl Shift G', 'Group / ungroup'],
  ['Ctrl L', 'Lock or unlock'],
  ['Ctrl A', 'Select everything on the slide'],
  ['Arrows (Shift)', 'Nudge 1 px (10 px)'],
  ['] / [', 'Bring forward / send backward (Ctrl for front/back)'],
  ['Enter', 'Edit the selected text or table'],
  ['Esc', 'Stop editing, clear selection'],
  ['Shift while dragging', 'Move in a straight line; corners: free resize'],
  ['Alt while dragging', 'Turn off snapping'],
  ['Ctrl scroll', 'Zoom'],
  ['Ctrl Enter / F5', 'Present from this slide / from the start'],
  ['Up / Down', 'Previous / next slide (nothing selected)'],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className="shortcut-table">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">On a Mac, use Cmd instead of Ctrl.</p>
    </Modal>
  );
}
