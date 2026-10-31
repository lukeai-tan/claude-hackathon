import { memo, useState } from 'react';
import { Copy, EyeOff, Eye, Plus, Trash2 } from 'lucide-react';
import { mutate, useEditor } from '../store/editor';
import { addSlide, deleteSlide, duplicateSlide, enterLayoutEditing, goToSlide, moveSlide } from '../store/actions';
import { SlideView } from '../render/SlideView';
import type { Deck, Layout, Slide } from '../model/types';
import { Popover } from './ui';

const thumbWidth = (deck: Deck) => Math.min(176, 100 * deck.size.w / deck.size.h);

const SlideThumb = memo(function SlideThumb({ deck, slide, index }: { deck: Deck; slide: Slide; index: number }) {
  return <SlideView deck={deck} slide={slide} mode="thumb" scale={thumbWidth(deck) / deck.size.w} index={index} />;
});

export function LayoutThumb({ deck, layout, width }: { deck: Deck; layout: Layout; width: number }) {
  return <SlideView deck={deck} slide={null} layout={layout} mode="edit" scale={width / deck.size.w} index={0} />;
}

export function LayoutPicker({ onPick, current }: { onPick: (id: string) => void; current?: string }) {
  const deck = useEditor((s) => s.deck)!;
  return (
    <div className="layout-picker">
      {deck.layouts.map((l) => (
        <button key={l.id} className={`layout-opt${current === l.id ? ' on' : ''}`} onClick={() => onPick(l.id)} title={l.name}>
          <div className="lp-thumb" style={{ height: (120 * deck.size.h) / deck.size.w }}>
            <LayoutThumb deck={deck} layout={l} width={120} />
          </div>
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
}

export function SlidePanel() {
  const deck = useEditor((s) => s.deck)!;
  const slideId = useEditor((s) => s.slideId);
  const target = useEditor((s) => s.target);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  if (target.kind === 'layout') {
    return (
      <aside className="slide-panel">
        <div className="panel-title">Layouts</div>
        <div className="thumbs">
          {deck.layouts.map((l) => {
            const uses = deck.slides.filter((s) => s.layoutId === l.id).length;
            return (
              <button key={l.id} className={`thumb${target.layoutId === l.id ? ' active' : ''}`} onClick={() => enterLayoutEditing(l.id)}>
                <div className="thumb-img" style={{ width: thumbWidth(deck), height: (thumbWidth(deck) * deck.size.h) / deck.size.w }}>
                  <LayoutThumb deck={deck} layout={l} width={thumbWidth(deck)} />
                </div>
                <span className="thumb-caption">
                  {l.name}
                  <span className="muted"> {uses ? `used by ${uses}` : 'unused'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="slide-panel">
      <div className="thumbs" onDragOver={(e) => e.preventDefault()}>
        {deck.slides.map((s, i) => (
          <div
            key={s.id}
            className={`thumb-row${dropAt === i ? ' drop-before' : ''}${dropAt === i + 1 && i === deck.slides.length - 1 ? ' drop-after' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragId(s.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', s.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dropAt !== null) {
                const from = deck.slides.findIndex((x) => x.id === dragId);
                moveSlide(dragId, dropAt > from ? dropAt - 1 : dropAt);
              }
              setDragId(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
            }}
          >
            <span className="thumb-num">{i + 1}</span>
            <button className={`thumb${slideId === s.id ? ' active' : ''}${s.hidden ? ' is-hidden' : ''}`} onClick={() => goToSlide(s.id)} aria-label={`Slide ${i + 1}`}>
              <div className="thumb-img" style={{ width: thumbWidth(deck), height: (thumbWidth(deck) * deck.size.h) / deck.size.w }}>
                <SlideThumb deck={deck} slide={s} index={i} />
              </div>
            </button>
            <div className="thumb-actions">
              <button title="Duplicate slide" aria-label="Duplicate slide" onClick={() => duplicateSlide(s.id)}>
                <Copy size={13} />
              </button>
              <button
                title={s.hidden ? 'Show in slideshow' : 'Hide in slideshow'}
                aria-label={s.hidden ? 'Show in slideshow' : 'Hide in slideshow'}
                onClick={() =>
                  mutate((d) => {
                    const x = d.slides.find((y) => y.id === s.id);
                    if (x) x.hidden = !x.hidden;
                  })
                }
              >
                {s.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button title="Delete slide" aria-label="Delete slide" onClick={() => deleteSlide(s.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Popover
        className="add-slide-anchor"
        trigger={(_, t) => (
          <button className="btn add-slide" onClick={t}>
            <Plus size={16} /> New slide
          </button>
        )}
      >
        {(close) => (
          <LayoutPicker
            onPick={(id) => {
              addSlide(id, slideId);
              close();
            }}
          />
        )}
      </Popover>
    </aside>
  );
}
