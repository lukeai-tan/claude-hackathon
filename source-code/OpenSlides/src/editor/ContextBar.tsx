import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Italic,
  List,
  ListOrdered,
  Lock,
  Minus,
  Plus,
  Strikethrough,
  Trash2,
  Underline,
  Unlock,
  LayoutTemplate,
  Group,
  Ungroup,
} from 'lucide-react';
import { currentSlide, useEditor } from '../store/editor';
import {
  align,
  changeLayout,
  deleteSelection,
  distribute,
  duplicateSelection,
  editSelected,
  groupSelection,
  reorder,
  toggleLock,
  ungroupSelection,
  type AlignMode,
} from '../store/actions';
import { getLayout, resolveElement } from '../model/resolve';
import { FONTS, fontStack, resolveColor, resolveFont } from '../model/theme';
import type { SlideElement, TextElement, TextStyle } from '../model/types';
import { applyFontSizeToSelection, exec, queryState, stripInline, withEditor } from '../render/richtext';
import { ColorPicker, IconButton, Popover } from './ui';
import { LayoutPicker } from './SlidePanel';

const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120, 144, 180, 240, 300];

function useResolvedSelection(): SlideElement[] {
  const deck = useEditor((s) => s.deck)!;
  const selection = useEditor((s) => s.selection);
  const target = useEditor((s) => s.target);
  const slideId = useEditor((s) => s.slideId);
  if (target.kind === 'layout') {
    return deck.layouts.find((l) => l.id === target.layoutId)?.elements.filter((e) => selection.includes(e.id)) ?? [];
  }
  const slide = deck.slides.find((s) => s.id === slideId) ?? deck.slides[0];
  const layout = getLayout(deck, slide.layoutId);
  return slide.elements.filter((e) => selection.includes(e.id)).map((e) => resolveElement(e, layout));
}

export { useResolvedSelection };

function FontPicker({ value, onPick, keepEditing }: { value: string; onPick: (f: string) => void; keepEditing: boolean }) {
  const theme = useEditor((s) => s.deck!.theme);
  const shown = resolveFont(value, theme);
  return (
    <Popover
      trigger={(_, t) => (
        <button className="font-btn" onMouseDown={(e) => keepEditing && e.preventDefault()} onClick={t} title="Font" style={{ fontFamily: fontStack(shown) }}>
          {value.startsWith('theme:') ? `${shown} (${value === 'theme:heading' ? 'heading' : 'body'})` : shown}
        </button>
      )}
    >
      {(close) => (
        <div className="font-list" data-keep-editing="">
          {!keepEditing && (
            <>
              <div className="pop-label">Brand fonts</div>
              {(['theme:heading', 'theme:body'] as const).map((ref) => (
                <button key={ref} className={value === ref ? 'on' : ''} style={{ fontFamily: fontStack(resolveFont(ref, theme)) }} onClick={() => { onPick(ref); close(); }}>
                  {resolveFont(ref, theme)} <span className="muted small">{ref === 'theme:heading' ? 'Heading' : 'Body'}</span>
                </button>
              ))}
              <div className="pop-label">All fonts</div>
            </>
          )}
          {FONTS.map((f) => (
            <button key={f.name} className={shown === f.name && !value.startsWith('theme:') ? 'on' : ''} style={{ fontFamily: fontStack(f.name) }} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(f.name); close(); }}>
              {f.name}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function TextControls({ els }: { els: TextElement[] }) {
  const editingId = useEditor((s) => s.editingId);
  const theme = useEditor((s) => s.deck!.theme);
  const editing = !!editingId && els.some((e) => e.id === editingId);
  const first = els[0];
  const s = first.style;
  const [state, setState] = useState(queryState());

  useEffect(() => {
    if (!editing) return;
    const on = () => setState(queryState());
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, [editing]);

  const setStyle = (patch: Partial<TextStyle>, strip: string[] = []) =>
    editSelected(
      (el) => {
        if (el.type !== 'text') return;
        Object.assign(el.style, patch);
        if (strip.length) el.html = stripInline(el.html, strip);
      },
      { touches: ['style'] },
    );

  const toggle = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    if (editing && withEditor(() => exec(cmd))) return;
    if (cmd === 'bold') setStyle({ bold: !s.bold }, ['font-weight']);
    if (cmd === 'italic') setStyle({ italic: !s.italic }, ['font-style']);
    if (cmd === 'underline') setStyle({ underline: !s.underline }, ['text-decoration', 'text-decoration-line']);
    if (cmd === 'strikeThrough') withEditor(() => exec(cmd));
  };

  const setSize = (px: number) => {
    if (editing && withEditor((ed) => applyFontSizeToSelection(ed, px))) return;
    setStyle({ fontSize: px }, ['font-size']);
  };

  const setFont = (f: string) => {
    if (editing && withEditor(() => exec('fontName', f))) return;
    setStyle({ fontFamily: f }, ['font-family']);
  };

  const setColor = (c: string) => {
    if (editing && withEditor(() => exec('foreColor', resolveColor(c, theme)))) return;
    setStyle({ color: c }, ['color']);
  };

  const setAlign = (a: TextStyle['align']) => {
    if (editing && withEditor(() => exec({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[a]))) return;
    setStyle({ align: a }, ['text-align']);
  };

  const list = (ordered: boolean) => {
    const cmd = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    if (editing && withEditor(() => exec(cmd))) return;
    // Not editing: toggle bullets for the whole box.
    editSelected((el) => {
      if (el.type !== 'text') return;
      const div = document.createElement('div');
      div.innerHTML = el.html;
      const hasList = div.querySelector(ordered ? 'ol' : 'ul');
      if (hasList) {
        const items = Array.from(div.querySelectorAll('li')).map((li) => `<p>${li.innerHTML}</p>`);
        el.html = items.join('');
      } else {
        const paras = Array.from(div.children).filter((c) => c.tagName === 'P');
        const tag = ordered ? 'ol' : 'ul';
        if (paras.length) el.html = `<${tag}>${paras.map((p) => `<li>${p.innerHTML}</li>`).join('')}</${tag}>`;
      }
    });
  };

  const bold = editing ? state.bold : s.bold;
  const italic = editing ? state.italic : s.italic;
  const underline = editing ? state.underline : s.underline;

  return (
    <div className="ctx-group" data-keep-editing="">
      <FontPicker value={s.fontFamily} onPick={setFont} keepEditing={editing} />
      <div className="size-stepper">
        <button aria-label="Smaller text" title="Smaller" onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(SIZES.slice().reverse().find((x) => x < s.fontSize) ?? Math.max(6, s.fontSize - 2))}>
          <Minus size={13} />
        </button>
        <Popover
          trigger={(_, t) => (
            <button className="size-val" onMouseDown={(e) => editing && e.preventDefault()} onClick={t} title="Font size (px on the slide)">
              {Math.round(s.fontSize)}
            </button>
          )}
        >
          {(close) => (
            <div className="size-list" data-keep-editing="">
              {SIZES.map((n) => (
                <button key={n} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSize(n); close(); }}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <button aria-label="Larger text" title="Larger" onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(SIZES.find((x) => x > s.fontSize) ?? s.fontSize + 4)}>
          <Plus size={13} />
        </button>
      </div>
      <ColorPicker value={s.color} onChange={setColor} allowTransparent={false} label="Text colour" keepEditing={editing} />
      <IconButton title="Bold (Ctrl+B)" active={bold} onClick={() => toggle('bold')} keepEditing>
        <Bold size={16} />
      </IconButton>
      <IconButton title="Italic (Ctrl+I)" active={italic} onClick={() => toggle('italic')} keepEditing>
        <Italic size={16} />
      </IconButton>
      <IconButton title="Underline (Ctrl+U)" active={underline} onClick={() => toggle('underline')} keepEditing>
        <Underline size={16} />
      </IconButton>
      {editing && (
        <IconButton title="Strikethrough" active={state.strike} onClick={() => toggle('strikeThrough')} keepEditing>
          <Strikethrough size={16} />
        </IconButton>
      )}
      <span className="ctx-sep" />
      <IconButton title="Align left" active={!editing && s.align === 'left'} onClick={() => setAlign('left')} keepEditing>
        <AlignLeft size={16} />
      </IconButton>
      <IconButton title="Centre" active={!editing && s.align === 'center'} onClick={() => setAlign('center')} keepEditing>
        <AlignCenter size={16} />
      </IconButton>
      <IconButton title="Align right" active={!editing && s.align === 'right'} onClick={() => setAlign('right')} keepEditing>
        <AlignRight size={16} />
      </IconButton>
      <IconButton title="Justify" active={!editing && s.align === 'justify'} onClick={() => setAlign('justify')} keepEditing>
        <AlignJustify size={16} />
      </IconButton>
      <IconButton title="Bulleted list" active={editing && state.ul} onClick={() => list(false)} keepEditing>
        <List size={16} />
      </IconButton>
      <IconButton title="Numbered list" active={editing && state.ol} onClick={() => list(true)} keepEditing>
        <ListOrdered size={16} />
      </IconButton>
    </div>
  );
}

const ALIGNS: { mode: AlignMode; label: string; icon: ReactNode }[] = [
  { mode: 'left', label: 'Align left edges', icon: <AlignStartVertical size={16} /> },
  { mode: 'hcenter', label: 'Align centres horizontally', icon: <AlignCenterVertical size={16} /> },
  { mode: 'right', label: 'Align right edges', icon: <AlignEndVertical size={16} /> },
  { mode: 'top', label: 'Align top edges', icon: <AlignStartHorizontal size={16} /> },
  { mode: 'vcenter', label: 'Align middles', icon: <AlignCenterHorizontal size={16} /> },
  { mode: 'bottom', label: 'Align bottom edges', icon: <AlignEndHorizontal size={16} /> },
];

function ArrangeControls({ els }: { els: SlideElement[] }) {
  const locked = els.every((e) => e.locked);
  const grouped = els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId);
  return (
    <div className="ctx-group right">
      <Popover
        align="right"
        trigger={(_, t) => (
          <button className="tb-btn" onClick={t} title={els.length === 1 ? 'Position on the slide' : 'Align and distribute'}>
            <AlignCenterVertical size={16} /> <span>Position</span>
          </button>
        )}
      >
        {() => (
          <div className="align-pop">
            <div className="pop-label">{els.length === 1 ? 'Align to slide' : 'Align selection'}</div>
            <div className="align-grid">
              {ALIGNS.map((a) => (
                <button key={a.mode} title={a.label} aria-label={a.label} onClick={() => align(a.mode)}>
                  {a.icon}
                </button>
              ))}
            </div>
            {els.length >= 3 && (
              <>
                <div className="pop-label">Distribute evenly</div>
                <div className="align-grid two">
                  <button onClick={() => distribute('h')} title="Distribute horizontally">
                    <AlignHorizontalDistributeCenter size={16} /> Horizontally
                  </button>
                  <button onClick={() => distribute('v')} title="Distribute vertically">
                    <AlignVerticalDistributeCenter size={16} /> Vertically
                  </button>
                </div>
              </>
            )}
            <div className="pop-label">Layer</div>
            <div className="align-grid two">
              <button onClick={() => reorder('front')}>
                <ArrowUpToLine size={16} /> To front
              </button>
              <button onClick={() => reorder('back')}>
                <ArrowDownToLine size={16} /> To back
              </button>
              <button onClick={() => reorder('forward')}>Forward ]</button>
              <button onClick={() => reorder('backward')}>Backward [</button>
            </div>
          </div>
        )}
      </Popover>
      {els.length > 1 && (
        <IconButton title={grouped ? 'Ungroup (Ctrl+Shift+G)' : 'Group (Ctrl+G)'} onClick={grouped ? ungroupSelection : groupSelection}>
          {grouped ? <Ungroup size={16} /> : <Group size={16} />}
        </IconButton>
      )}
      <IconButton title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} onClick={toggleLock}>
        {locked ? <Lock size={16} /> : <Unlock size={16} />}
      </IconButton>
      <IconButton title="Duplicate (Ctrl+D)" onClick={duplicateSelection}>
        <Copy size={16} />
      </IconButton>
      <IconButton title="Delete (Del)" onClick={deleteSelection} danger>
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}

function SlideControls() {
  const deck = useEditor((s) => s.deck)!;
  const target = useEditor((s) => s.target);
  const slide = currentSlide();
  if (target.kind === 'layout' || !slide) {
    return <div className="ctx-hint">Placeholders you move or restyle here update on every slide that uses this layout.</div>;
  }
  const layout = getLayout(deck, slide.layoutId);
  return (
    <div className="ctx-group">
      <Popover
        trigger={(_, t) => (
          <button className="tb-btn" onClick={t} title="Change this slide’s layout">
            <LayoutTemplate size={16} /> <span>Layout: {layout.name}</span>
          </button>
        )}
      >
        {(close) => (
          <LayoutPicker
            current={slide.layoutId}
            onPick={(id) => {
              changeLayout(slide.id, id);
              close();
            }}
          />
        )}
      </Popover>
      <span className="ctx-hint">Double-click text to edit. Drop or paste images straight onto the slide.</span>
    </div>
  );
}

export function ContextBar() {
  const els = useResolvedSelection();
  const texts = els.filter((e): e is TextElement => e.type === 'text');
  return (
    <div className="context-bar" onPointerDown={(e) => e.stopPropagation()}>
      {els.length === 0 ? (
        <SlideControls />
      ) : (
        <>
          {texts.length > 0 && texts.length === els.length ? <TextControls key={texts.map((t) => t.id).join()} els={texts} /> : <div className="ctx-group"><span className="ctx-hint">{els.length === 1 ? describe(els[0]) : `${els.length} items selected`}</span></div>}
          <ArrangeControls els={els} />
        </>
      )}
    </div>
  );
}

function describe(el: SlideElement) {
  switch (el.type) {
    case 'chart':
      return 'Chart: double-click to edit the data';
    case 'table':
      return 'Table: double-click to type in cells';
    case 'image':
      return el.assetId ? 'Image: double-click to replace' : 'Image placeholder: double-click or drop an image';
    case 'shape':
      return 'Shape';
    default:
      return 'Text';
  }
}
