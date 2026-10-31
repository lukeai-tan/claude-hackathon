import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  Circle,
  Cloud,
  Download,
  Heading,
  ImagePlus,
  Keyboard,
  LayoutTemplate,
  MonitorPlay,
  Play,
  Redo2,
  Shapes,
  Stethoscope,
  Table,
  Type,
  Undo2,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { currentSlide, redo, setToast, undo, useEditor } from '../store/editor';
import { exitLayoutEditing, insertChart, insertImageFiles, insertShape, insertTable, insertText, renameDeck } from '../store/actions';
import { onSaveStatus, type SaveStatus } from '../store/storage';
import { Popover } from './ui';
import { SHAPE_LABELS, shapePath } from '../render/shapes';
import type { ChartType, ShapeKind } from '../model/types';
import { navigate } from '../router';
import { useIssues } from '../doctor/checks';
import { exportDeckFile } from '../io/deckfile';

const SHAPES: ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'chevron', 'star', 'line', 'arrow'];
const CHARTS: { type: ChartType; label: string; icon: ReactNode }[] = [
  { type: 'column', label: 'Column', icon: <ChartColumn size={18} /> },
  { type: 'bar', label: 'Bar', icon: <ChartBar size={18} /> },
  { type: 'line', label: 'Line', icon: <ChartLine size={18} /> },
  { type: 'area', label: 'Area', icon: <ChartArea size={18} /> },
  { type: 'pie', label: 'Pie', icon: <ChartPie size={18} /> },
  { type: 'doughnut', label: 'Doughnut', icon: <Circle size={18} /> },
];

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  if (kind === 'line' || kind === 'arrow') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <line x1="3" y1="14" x2={kind === 'arrow' ? 20 : 25} y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {kind === 'arrow' && <path d="M18 8 L26 14 L18 20 Z" fill="currentColor" />}
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="-2 -2 28 28">
      <path d={shapePath(kind, 24, 24, 6)} fill="currentColor" />
    </svg>
  );
}

function TablePicker({ onPick }: { onPick: (r: number, c: number) => void }) {
  const [hover, setHover] = useState({ r: 3, c: 3 });
  return (
    <div className="table-picker">
      <div className="pop-label">
        {hover.r} × {hover.c} table
      </div>
      <div className="tp-grid" onMouseLeave={() => setHover({ r: 3, c: 3 })}>
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <button
              key={`${r}-${c}`}
              className={`tp-cell${r < hover.r && c < hover.c ? ' on' : ''}`}
              aria-label={`${r + 1} by ${c + 1}`}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onClick={() => onPick(r + 1, c + 1)}
            />
          )),
        )}
      </div>
    </div>
  );
}

function SaveBadge() {
  const [s, setS] = useState<SaveStatus>('saved');
  useEffect(() => {
    const off = onSaveStatus(setS);
    return () => {
      off();
    };
  }, []);
  return (
    <span className={`save-badge ${s}`} title="Decks are stored in this browser and work offline">
      <Cloud size={14} /> {s === 'saving' ? 'Saving…' : s === 'error' ? 'Not saved: storage is full or blocked' : 'Saved on this device'}
    </span>
  );
}

export function TopBar() {
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const deck = useEditor((s) => s.deck)!;
  const target = useEditor((s) => s.target);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [title, setTitle] = useState(deck.title);
  const imgRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setTitle(deck.title), [deck.title]);
  const issues = useIssues();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const layoutName = target.kind === 'layout' ? deck.layouts.find((l) => l.id === target.layoutId)?.name : null;

  const slideIndex = () => {
    const s = currentSlide();
    return s ? deck.slides.indexOf(s) : 0;
  };

  const runExport = async (kind: 'pptx' | 'pdf' | 'png' | 'pngs') => {
    setBusy(kind);
    try {
      const mod = await import('../io/export');
      if (kind === 'pptx') await mod.exportPptx(deck);
      if (kind === 'pdf') await mod.exportPdf(deck);
      if (kind === 'png') await mod.exportPng(deck, slideIndex());
      if (kind === 'pngs') await mod.exportAllPngs(deck);
      setToast(kind === 'pptx' ? 'PowerPoint file downloaded' : kind === 'pdf' ? 'PDF downloaded' : 'Images downloaded');
    } catch (e) {
      console.error(e);
      setToast(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="topbar">
      {window.deckforgeDesktop?.suiteMode && <button className="tb-btn" onClick={() => void window.deckforgeDesktop?.openSuiteHome?.()} title="OpenSuite home">Suite</button>}
      <button className="brand" onClick={() => navigate('#/')} title="All decks" aria-label="All decks">
        <img src="favicon.svg" alt="" width={26} height={26} />
      </button>
      <input
        className="title-input"
        value={title}
        aria-label="Deck title"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== deck.title && renameDeck(title.trim() || 'Untitled deck')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      <SaveBadge />

      <div className="tb-group insert">
        <Popover
          trigger={(_, t) => (
            <button className="tb-btn" onClick={t} title="Add text">
              <Type size={17} /> <span>Text</span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <button onClick={() => { insertText('heading'); close(); }}>
                <Heading size={16} /> Heading
              </button>
              <button onClick={() => { insertText('body'); close(); }}>
                <Type size={16} /> Body text
              </button>
            </div>
          )}
        </Popover>
        <Popover
          trigger={(_, t) => (
            <button className="tb-btn" onClick={t} title="Add a shape">
              <Shapes size={17} /> <span>Shape</span>
            </button>
          )}
        >
          {(close) => (
            <div className="shape-grid">
              {SHAPES.map((k) => (
                <button key={k} title={SHAPE_LABELS[k]} aria-label={SHAPE_LABELS[k]} onClick={() => { insertShape(k); close(); }}>
                  <ShapeIcon kind={k} />
                </button>
              ))}
            </div>
          )}
        </Popover>
        <button className="tb-btn" onClick={() => imgRef.current?.click()} title="Add an image (or drag one onto the slide, or paste)">
          <ImagePlus size={17} /> <span>Image</span>
        </button>
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) insertImageFiles(files);
            e.target.value = '';
          }}
        />
        <Popover
          trigger={(_, t) => (
            <button className="tb-btn" onClick={t} title="Add a chart">
              <ChartColumn size={17} /> <span>Chart</span>
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              {CHARTS.map((c) => (
                <button key={c.type} onClick={() => { insertChart(c.type); close(); }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <Popover
          trigger={(_, t) => (
            <button className="tb-btn" onClick={t} title="Add a table">
              <Table size={17} /> <span>Table</span>
            </button>
          )}
        >
          {(close) => (
            <TablePicker
              onPick={(r, c) => {
                insertTable(r, c);
                close();
              }}
            />
          )}
        </Popover>
      </div>

      <div className="tb-group">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Redo2 size={17} />
        </button>
      </div>

      <div className="tb-spacer" />

      <button className="tb-btn ai-top-btn" onClick={() => useEditor.setState({ studioTab: 'ai' })} title="Design with Claudia"><Sparkles size={17} /><span>Ask Claudia</span></button>
      <button className="tb-btn" aria-label="Toggle properties" aria-pressed={inspectorOpen} onClick={() => useEditor.setState({ inspectorOpen: !useEditor.getState().inspectorOpen })}><SlidersHorizontal size={17} /><span>Properties</span></button>

      {layoutName ? (
        <button className="btn layout-done" onClick={exitLayoutEditing}>
          Done editing “{layoutName}”
        </button>
      ) : (
        <button className="tb-btn" onClick={() => useEditor.setState({ dialog: 'layouts' })} title="Edit slide layouts (masters)">
          <LayoutTemplate size={17} /> <span>Layouts</span>
        </button>
      )}

      <button className={`tb-btn check-btn${errors ? ' has-errors' : ''}`} onClick={() => useEditor.setState({ panel: 'check', inspectorOpen: true })} title="Check the deck for readability problems">
        <Stethoscope size={17} />
        {issues.length > 0 && <span className="count">{issues.length}</span>}
      </button>

      <Popover
        align="right"
        trigger={(_, t) => (
          <button className="btn" onClick={t} disabled={!!busy}>
            <Download size={16} /> {busy ? 'Exporting…' : 'Export'} <ChevronDown size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="menu wide">
            <button onClick={() => { close(); runExport('pptx'); }}>
              <strong>PowerPoint (.pptx)</strong>
              <span>Editable text, native charts and tables, speaker notes</span>
            </button>
            <button onClick={() => { close(); runExport('pdf'); }}>
              <strong>PDF</strong>
              <span>One page per slide, fonts embedded as rendered</span>
            </button>
            <button onClick={() => { close(); runExport('png'); }}>
              <strong>PNG of this slide</strong>
              <span>Full resolution image</span>
            </button>
            <button onClick={() => { close(); runExport('pngs'); }}>
              <strong>PNGs of all slides (.zip)</strong>
              <span>For social posts or documents</span>
            </button>
            <button onClick={() => { close(); exportDeckFile(deck); }}>
              <strong>Deck file (.openslides.json)</strong>
              <span>Back up or move this deck to another device</span>
            </button>
          </div>
        )}
      </Popover>

      <div className="present-split">
        <button className="btn primary" onClick={() => navigate(`#/present/${deck.id}?s=${slideIndex()}`)} title="Present from this slide (Ctrl+Enter)">
          <Play size={16} /> Present
        </button>
        <Popover
          align="right"
          trigger={(_, t) => (
            <button className="btn primary split-arrow" onClick={t} aria-label="More presenting options">
              <ChevronDown size={14} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu wide">
              <button onClick={() => { close(); navigate(`#/present/${deck.id}?s=0`); }}>
                <strong>From the beginning</strong>
                <span>F5</span>
              </button>
              <button onClick={() => { close(); navigate(`#/presenter/${deck.id}?s=${slideIndex()}`); }}>
                <strong>
                  <MonitorPlay size={15} /> Presenter view
                </strong>
                <span>Notes, timer and next slide here; slides in a second window</span>
              </button>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
