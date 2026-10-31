import { useEffect, useRef, useState } from 'react';
import { SlideView } from '../render/SlideView';
import { navigate } from '../router';
import { channelName, handleShowKey, usePresentation, useDeck, useWindowSize, type ShowMsg } from './usePresentation';

export function SlideshowPage({ id, start, audience = false }: { id: string; start: number; audience?: boolean }) {
  const deck = useDeck(id);
  const show = usePresentation(deck, start);
  const { slides, state, setState, next, prev, goto, toggleBlack } = show;
  const size = useWindowSize();
  const [hint, setHint] = useState(true);
  const [idle, setIdle] = useState(false);
  const chan = useRef<BroadcastChannel | null>(null);

  // Audience windows follow the presenter console over a BroadcastChannel.
  useEffect(() => {
    if (!audience) return;
    const c = new BroadcastChannel(channelName(id));
    chan.current = c;
    c.onmessage = (ev: MessageEvent<ShowMsg>) => {
      if (ev.data.type === 'state') setState(ev.data.state);
    };
    c.postMessage({ type: 'hello' } satisfies ShowMsg);
    return () => c.close();
  }, [audience, id, setState]);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (audience) window.close();
    else navigate(`#/d/${id}`);
  };

  const nav = (dir: 'next' | 'prev' | 'black' | 'first' | 'last') => {
    if (audience) {
      chan.current?.postMessage({ type: 'nav', dir } satisfies ShowMsg);
      return;
    }
    if (dir === 'next') next();
    else if (dir === 'prev') prev();
    else if (dir === 'black') toggleBlack();
    else if (dir === 'first') goto(0);
    else goto(slides.length - 1);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      handleShowKey(e, {
        next: () => nav('next'),
        prev: () => nav('prev'),
        goto: (i) => nav(i === 0 ? 'first' : 'last'),
        toggleBlack: () => nav('black'),
        count: slides.length,
        exit,
      });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2000);
    };
    on();
    window.addEventListener('mousemove', on);
    return () => {
      window.removeEventListener('mousemove', on);
      clearTimeout(t);
    };
  }, []);

  if (deck === null) {
    return (
      <div className="show dark center-msg">
        <p>This deck isn’t saved in this browser.</p>
      </div>
    );
  }
  if (!deck) return <div className="show dark" />;

  const slide = slides[state.i];
  const scale = Math.min(size.w / deck.size.w, size.h / deck.size.h);
  const index = deck.slides.indexOf(slide);

  return (
    <div
      className={`show dark${idle ? ' idle' : ''}`}
      onClick={() => nav('next')}
      onContextMenu={(e) => {
        e.preventDefault();
        nav('prev');
      }}
    >
      {state.ended ? (
        <div className="show-end">
          <p>End of slideshow</p>
          <p className="muted small">Click to go back, or press Esc to exit.</p>
        </div>
      ) : (
        slide && (
          <div key={slide.id} className={`show-slide tr-${slide.transition}`}>
            <SlideView deck={deck} slide={slide} mode="present" scale={scale} index={index} step={state.step} animateStep={state.animateStep} />
          </div>
        )
      )}
      {state.black && <div className="show-black" />}
      {hint && !audience && (
        <div className="show-hint">
          Click or press → to advance, ← to go back, B for a black screen, F for full screen, Esc to exit.
        </div>
      )}
      {!audience && !idle && (
        <div className="show-controls" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => nav('prev')} aria-label="Previous">
            ‹
          </button>
          <span>
            {state.i + 1} / {slides.length}
          </span>
          <button onClick={() => nav('next')} aria-label="Next">
            ›
          </button>
          <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Full screen</button>
          <button onClick={exit}>Exit</button>
        </div>
      )}
    </div>
  );
}
