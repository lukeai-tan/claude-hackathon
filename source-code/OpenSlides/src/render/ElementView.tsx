import { memo, useMemo, useEffect, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Deck, ImageElement, ShapeElement, SlideElement, TableElement, TextElement, Theme } from '../model/types';
import { fontStack, resolveColor, resolveFont } from '../model/theme';
import { applyTokens, isEmptyHtml, type TokenContext } from '../model/resolve';
import { shapePath } from './shapes';
import { ChartView } from './ChartView';
import { rememberSelection, sanitizeHtml } from './richtext';
import type { BuildInfo } from './builds';

export type RenderMode = 'edit' | 'thumb' | 'present' | 'export';

export interface AnimState {
  info: BuildInfo;
  phase: 'hidden' | 'enter' | 'shown';
  effect: string;
}

export interface ElementViewProps {
  el: SlideElement;
  deck: Deck;
  mode: RenderMode;
  tokens: TokenContext;
  prompt?: string;
  listDefault?: boolean;
  editing?: boolean;
  passive?: boolean; // layout decorations under a slide: no pointer events
  anim?: AnimState;
  onPointerDown?: (e: RPointerEvent, el: SlideElement) => void;
  onDoubleClick?: (el: SlideElement) => void;
  onTextCommit?: (el: TextElement, html: string) => void;
  onTextMeasure?: (el: TextElement, h: number) => void;
  onTableCommit?: (el: TableElement, rows: string[][]) => void;
}

export function textCss(el: TextElement, theme: Theme): CSSProperties {
  const s = el.style;
  return {
    fontFamily: fontStack(resolveFont(s.fontFamily, theme)),
    fontSize: s.fontSize,
    color: resolveColor(s.color, theme),
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: s.underline ? 'underline' : 'none',
    textAlign: s.align,
    lineHeight: s.lineHeight,
    letterSpacing: `${s.letterSpacing}em`,
  };
}

function TextEditable({ el, theme, listDefault, onCommit, onMeasure }: { el: TextElement; theme: Theme; listDefault?: boolean; onCommit: (html: string) => void; onMeasure?: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const committed = useRef(false);
  useLayoutEffect(() => {
    const node = ref.current!;
    node.innerHTML = el.html && !isEmptyHtml(el.html) ? sanitizeHtml(el.html) : listDefault ? '<ul><li><br></li></ul>' : '<p><br></p>';
    node.focus();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    const range = document.createRange();
    range.selectNodeContents(node);
    if (!isEmptyHtml(el.html)) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return () => {
      // React StrictMode re-runs effects on the same node; only commit if the editor really left the page.
      setTimeout(() => {
        if (!committed.current && !node.isConnected) {
          committed.current = true;
          onCommit(sanitizeHtml(node.innerHTML));
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="rt rt-editing"
      contentEditable
      suppressContentEditableWarning
      data-richtext="true"
      spellCheck
      onPointerDown={(e) => e.stopPropagation()}
      onInput={() => {
        if (onMeasure && ref.current) onMeasure(ref.current.offsetHeight);
      }}
      onPaste={(e) => {
        // Keep pasted text clean: plain text only, line breaks preserved.
        const text = e.clipboardData.getData('text/plain');
        if (text) {
          e.preventDefault();
          document.execCommand('insertText', false, text);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand(e.shiftKey ? 'outdent' : 'indent');
        }
        e.stopPropagation();
      }}
      onKeyUp={() => rememberSelection(ref.current!)}
      onMouseUp={() => rememberSelection(ref.current!)}
      onBlur={(e) => {
        rememberSelection(ref.current!);
        // Focus moving into the text toolbar keeps the edit session open.
        const next = e.relatedTarget as HTMLElement | null;
        if (next && next.closest('[data-keep-editing]')) return;
        if (committed.current) return;
        committed.current = true;
        onCommit(sanitizeHtml(ref.current!.innerHTML));
      }}
      style={{ outline: 'none', minHeight: '1em', cursor: 'text' }}
    />
  );
}

function TextBlock({ el, deck, mode, tokens, prompt, editing, listDefault, onTextCommit, onTextMeasure }: ElementViewProps & { el: TextElement }) {
  const theme = deck.theme;
  const innerRef = useRef<HTMLDivElement>(null);
  const empty = isEmptyHtml(el.html);
  const cleanHtml = useMemo(() => sanitizeHtml(el.html), [el.html]);
  const html = applyTokens(cleanHtml, tokens);
  useEffect(() => {
    if (mode !== 'edit' || editing || !el.autoHeight || !onTextMeasure || !innerRef.current) return;
    const h = innerRef.current.offsetHeight + el.padding * 2;
    if (Math.abs(h - el.h) > 1) onTextMeasure(el, h);
  });
  const justify = el.style.valign === 'middle' ? 'center' : el.style.valign === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <div
      className="text-box"
      style={{
        ...textCss(el, theme),
        width: '100%',
        height: '100%',
        padding: el.padding,
        background: resolveColor(el.fill, theme),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      {editing ? (
        <TextEditable
          el={el}
          theme={theme}
          listDefault={listDefault}
          onCommit={(h) => onTextCommit?.(el, h)}
          onMeasure={el.autoHeight && onTextMeasure ? (h) => onTextMeasure(el, h + el.padding * 2) : undefined}
        />
      ) : empty && mode === 'edit' && prompt ? (
        <div ref={innerRef} className="rt rt-prompt">
          {prompt}
        </div>
      ) : (
        <div ref={innerRef} className="rt" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function ShapeBlock({ el, theme }: { el: ShapeElement; theme: Theme }) {
  const fill = resolveColor(el.fill, theme);
  const stroke = resolveColor(el.stroke, theme);
  const sw = el.strokeWidth;
  if (el.shape === 'line' || el.shape === 'arrow') {
    const y = el.h / 2;
    const head = Math.max(sw * 3.2, 14);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${el.w} ${el.h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <line x1={0} y1={y} x2={el.shape === 'arrow' ? el.w - head * 0.8 : el.w} y2={y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        {el.shape === 'arrow' && <path d={`M${el.w - head} ${y - head * 0.6} L${el.w} ${y} L${el.w - head} ${y + head * 0.6} Z`} fill={stroke} />}
      </svg>
    );
  }
  const inset = sw / 2;
  return (
    <svg width="100%" height="100%" viewBox={`${-inset} ${-inset} ${el.w + sw} ${el.h + sw}`} preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
      <path d={shapePath(el.shape, el.w, el.h, el.radius)} fill={fill} stroke={sw > 0 ? stroke : 'none'} strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
}

function ImageBlock({ el, deck, mode, prompt }: { el: ImageElement; deck: Deck; mode: RenderMode; prompt?: string }) {
  const id = el.assetId === 'theme:logo' ? deck.theme.logoAssetId : el.assetId;
  const asset = id ? deck.assets[id] : undefined;
  if (!asset) {
    if (el.assetId === 'theme:logo') return null;
    if (mode !== 'edit') return null;
    return (
      <div className="img-placeholder" style={{ borderRadius: el.radius }}>
        <span>{prompt ?? 'Drop an image here'}</span>
      </div>
    );
  }
  const f = el.filters;
  return (
    <img
      src={asset.dataUrl}
      alt={el.alt ?? ''}
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: el.fit,
        borderRadius: el.radius,
        display: 'block',
        filter: `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) grayscale(${f.grayscale})`,
      }}
    />
  );
}

function TableBlock({ el, theme, editing, onCommit }: { el: TableElement; theme: Theme; editing?: boolean; onCommit?: (rows: string[][]) => void }) {
  const s = el.style;
  const rowsRef = useRef<string[][]>(el.rows.map((r) => [...r]));
  useEffect(() => {
    rowsRef.current = el.rows.map((r) => [...r]);
  }, [el.rows]);
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const border = resolveColor(s.borderColor, theme);
  return (
    <table
      className="el-table"
      style={{
        width: '100%',
        height: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontFamily: fontStack(resolveFont(s.fontFamily, theme)),
        fontSize: s.fontSize,
        color: resolveColor(s.color, theme),
        background: resolveColor(s.fill, theme),
      }}
      onPointerDown={editing ? (e) => e.stopPropagation() : undefined}
    >
      <tbody>
        {el.rows.map((row, ri) => {
          const header = el.headerRow && ri === 0;
          const bg = header ? resolveColor(s.headerFill, theme) : s.stripe && ri % 2 === (el.headerRow ? 0 : 1) ? resolveColor(s.stripeFill, theme) : 'transparent';
          return (
            <tr key={ri} style={{ background: bg, height: `${100 / el.rows.length}%` }}>
              {Array.from({ length: cols }, (_, ci) => (
                <td
                  key={ci}
                  contentEditable={editing}
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    if (!editing) return;
                    const text = (e.currentTarget.innerText ?? '').replace(/\n+$/, '');
                    const rows = rowsRef.current.map((r) => [...r]);
                    while (rows[ri].length < cols) rows[ri].push('');
                    if (rows[ri][ci] !== text) {
                      rows[ri][ci] = text;
                      rowsRef.current = rows;
                      onCommit?.(rows);
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    border: `2px solid ${border}`,
                    padding: `${s.fontSize * 0.35}px ${s.fontSize * 0.55}px`,
                    fontWeight: header ? 700 : 400,
                    color: header ? resolveColor(s.headerColor, theme) : undefined,
                    verticalAlign: 'middle',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    outline: 'none',
                    cursor: editing ? 'text' : undefined,
                  }}
                >
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function animStyle(anim: AnimState | undefined): CSSProperties {
  if (!anim) return {};
  if (anim.phase === 'hidden') return { visibility: 'hidden' };
  if (anim.phase === 'enter') {
    return {
      animationName: `df-${anim.effect}`,
      animationDuration: `${anim.info.duration}ms`,
      animationDelay: `${anim.info.delay}ms`,
      animationFillMode: 'both',
      animationTimingFunction: 'cubic-bezier(.2,.7,.2,1)',
    };
  }
  return {};
}

function ElementViewInner(props: ElementViewProps) {
  const { el, deck, mode, editing, passive, anim, onPointerDown, onDoubleClick } = props;
  const theme = deck.theme;
  const style: CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity,
    pointerEvents: passive || mode !== 'edit' ? 'none' : 'auto',
    cursor: mode === 'edit' && !passive ? (el.locked ? 'default' : 'move') : undefined,
    zIndex: editing ? 5 : undefined,
    ...animStyle(anim),
  };
  let content: ReactNode = null;
  switch (el.type) {
    case 'text':
      content = <TextBlock {...props} el={el} />;
      break;
    case 'shape':
      content = <ShapeBlock el={el} theme={theme} />;
      break;
    case 'image':
      content = <ImageBlock el={el} deck={deck} mode={mode} prompt={props.prompt} />;
      break;
    case 'chart':
      content = <ChartView el={el} theme={theme} />;
      break;
    case 'table':
      content = <TableBlock el={el} theme={theme} editing={editing} onCommit={(rows) => props.onTableCommit?.(el, rows)} />;
      break;
  }
  return (
    <div
      className={`el el-${el.type}${mode === 'edit' && props.prompt && el.type === 'text' && isEmptyHtml(el.html) && !editing ? ' el-ph-empty' : ''}`}
      data-el-id={el.id}
      style={style}
      onPointerDown={onPointerDown && !passive ? (e) => onPointerDown(e, el) : undefined}
      onDoubleClick={onDoubleClick && !passive ? () => onDoubleClick(el) : undefined}
    >
      {content}
    </div>
  );
}

export const ElementView = memo(ElementViewInner);
