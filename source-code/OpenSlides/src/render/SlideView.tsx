import { memo, useMemo, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Deck, Layout, Slide, SlideElement, TableElement, TextElement } from '../model/types';
import { backgroundCss } from '../model/theme';
import { getLayout, resolveElement, slideBackground, type TokenContext } from '../model/resolve';
import { ElementView, type AnimState, type RenderMode } from './ElementView';
import { buildPlan } from './builds';

export interface SlideViewProps {
  deck: Deck;
  slide: Slide | null;
  /** Render a layout (slide master) on its own instead of a slide. */
  layout?: Layout;
  mode: RenderMode;
  scale: number;
  index: number;
  step?: number;
  animateStep?: number | null;
  editingId?: string | null;
  onElementPointerDown?: (e: RPointerEvent, el: SlideElement) => void;
  onElementDoubleClick?: (el: SlideElement) => void;
  onTextCommit?: (el: TextElement, html: string) => void;
  onTextMeasure?: (el: TextElement, h: number) => void;
  onTableCommit?: (el: TableElement, rows: string[][]) => void;
  children?: ReactNode;
}

function SlideViewInner(props: SlideViewProps) {
  const { deck, slide, mode, scale, index, step = Infinity, animateStep = null, editingId } = props;
  const W = deck.size.w;
  const H = deck.size.h;
  const layout = props.layout ?? (slide ? getLayout(deck, slide.layoutId) : undefined);
  const bg = props.layout ? props.layout.background : slide ? slideBackground(deck, slide) : { kind: 'solid' as const, color: 'theme:background' };
  const tokens: TokenContext = { n: index + 1, total: deck.slides.length, title: deck.title };
  const assetUrl = (id: string) => deck.assets[id]?.dataUrl;

  const elements = useMemo(() => {
    if (props.layout) return props.layout.elements;
    if (!slide) return [];
    return slide.elements.map((e) => resolveElement(e, layout));
  }, [props.layout, slide, layout]);

  const decorations = !props.layout && layout ? layout.elements.filter((e) => !e.placeholder) : [];

  const builds = useMemo(() => (mode === 'present' ? buildPlan(elements).plan : null), [mode, elements]);

  const animFor = (el: SlideElement): AnimState | undefined => {
    if (!builds) return undefined;
    const info = builds.get(el.id);
    if (!info || !el.anim) return undefined;
    const phase = info.step > step ? 'hidden' : info.step === animateStep ? 'enter' : 'shown';
    return { info, phase, effect: el.anim.effect };
  };

  const layoutEl = (el: SlideElement) => (el.ph && layout ? layout.elements.find((l) => l.id === el.ph!.ref) : el.placeholder ? el : undefined);

  return (
    <div className="slide-frame" style={{ width: W * scale, height: H * scale, position: 'relative', overflow: 'hidden', flex: 'none' }}>
      <div
        className="slide-surface"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          left: 0,
          top: 0,
          ...backgroundCss(bg, deck.theme, assetUrl),
        }}
      >
        {decorations.map((el) => (
          <ElementView key={`d-${el.id}`} el={el} deck={deck} mode={mode} tokens={tokens} passive />
        ))}
        {elements.map((el) => {
          const src = layoutEl(el);
          return (
            <ElementView
              key={el.id}
              el={el}
              deck={deck}
              mode={mode}
              tokens={tokens}
              prompt={src?.prompt}
              listDefault={src?.placeholder === 'body' || src?.placeholder === 'body2'}
              editing={editingId === el.id}
              anim={animFor(el)}
              onPointerDown={props.onElementPointerDown}
              onDoubleClick={props.onElementDoubleClick}
              onTextCommit={props.onTextCommit}
              onTextMeasure={props.onTextMeasure}
              onTableCommit={props.onTableCommit}
            />
          );
        })}
        {props.children}
      </div>
    </div>
  );
}

export const SlideView = memo(SlideViewInner);
