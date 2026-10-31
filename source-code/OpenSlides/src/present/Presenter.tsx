import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MonitorUp, Pause, Play, RotateCcw, Minus, Plus, X, Square } from 'lucide-react';
import { SlideView } from '../render/SlideView';
import { navigate } from '../router';
import { flushSave } from '../store/storage';
import { channelName, handleShowKey, stepsFor, usePresentation, useDeck, type ShowMsg } from './usePresentation';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
}

export function PresenterPage({ id, start }: { id: string; start: number }) {
  const deck = useDeck(id);
  const { slides, state, next, prev, goto, toggleBlack } = usePresentation(deck, start);
  const chan = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [notesSize, setNotesSize] = useState(22);
  const [now, setNow] = useState(new Date());
  const [popupBlocked, setPopupBlocked] = useState(false);
  const audienceWin = useRef<Window | null>(null);
  const apiRef = useRef({ next, prev, goto, toggleBlack });
  apiRef.current = { next, prev, goto, toggleBlack };

  useEffect(() => {
    const c = new BroadcastChannel(channelName(id));
    chan.current = c;
    c.onmessage = (ev: MessageEvent<ShowMsg>) => {
      const m = ev.data;
      if (m.type === 'hello') c.postMessage({ type: 'state', state: stateRef.current } satisfies ShowMsg);
      if (m.type === 'nav') {
        const a = apiRef.current;
        if (m.dir === 'next') a.next();
        if (m.dir === 'prev') a.prev();
        if (m.dir === 'black') a.toggleBlack();
        if (m.dir === 'first') a.goto(0);
        if (m.dir === 'last') a.goto(Number.MAX_SAFE_INTEGER);
      }
    };
    return () => c.close();
  }, [id]);

  useEffect(() => {
    chan.current?.postMessage({ type: 'state', state } satisfies ShowMsg);
  }, [state]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      if (running) setElapsed((e) => e + 1000);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const exit = () => {
    audienceWin.current?.close();
    navigate(`#/d/${id}`);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      handleShowKey(e, { next, prev, goto, toggleBlack, count: slides.length, exit });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const openAudience = async () => {
    await flushSave();
    const base = window.location.href.split('#')[0];
    const w = window.open(`${base}#/audience/${id}`, 'deckforge-audience', 'popup,width=1280,height=720');
    if (!w) setPopupBlocked(true);
    else {
      setPopupBlocked(false);
      audienceWin.current = w;
    }
  };

  useEffect(() => {
    openAudience();
    document.title = 'Presenter view | OpenSlides';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (deck === null) return <div className="center-msg">This deck isn’t saved in this browser.</div>;
  if (!deck) return <div className="center-msg muted">Opening…</div>;

  const slide = slides[state.i];
  const steps = slide ? stepsFor(deck, slide) : 0;
  const nextIsStep = state.step < steps;
  const nextSlide = nextIsStep ? slide : slides[state.i + 1];
  const curW = Math.min(760, window.innerWidth * 0.55);
  const nextW = Math.min(420, window.innerWidth * 0.3);

  return (
    <div className="presenter">
      <header className="pv-head">
        <div className="pv-timer">
          <span className="pv-elapsed" aria-label="Elapsed time">
            {fmt(elapsed)}
          </span>
          <button className="icon-btn light" onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause timer' : 'Resume timer'} title={running ? 'Pause timer' : 'Resume timer'}>
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="icon-btn light" onClick={() => setElapsed(0)} aria-label="Reset timer" title="Reset timer">
            <RotateCcw size={16} />
          </button>
        </div>
        <span className="pv-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="pv-actions">
          <button className="btn dark" onClick={openAudience}>
            <MonitorUp size={16} /> Open slides window
          </button>
          <button className={`btn dark${state.black ? ' on' : ''}`} onClick={toggleBlack} title="Black screen (B)">
            <Square size={16} /> {state.black ? 'Show slides' : 'Black screen'}
          </button>
          <button className="btn dark" onClick={exit}>
            <X size={16} /> End
          </button>
        </div>
      </header>
      {popupBlocked && (
        <div className="banner warn">
          Your browser blocked the slides window. Allow pop-ups for this site, then press “Open slides window”. Drag that window to the projector and press F for full screen.
        </div>
      )}
      <div className="pv-main">
        <section className="pv-current">
          <div className="pv-label">
            Slide {state.i + 1} of {slides.length}
            {steps > 0 && `, build ${state.step} of ${steps}`}
            {state.ended && ' (end of slideshow)'}
          </div>
          {slide && (
            <div className="pv-frame">
              <SlideView deck={deck} slide={slide} mode="present" scale={curW / deck.size.w} index={deck.slides.indexOf(slide)} step={state.step} animateStep={state.animateStep} />
            </div>
          )}
          <div className="pv-nav">
            <button className="btn dark" onClick={prev} aria-label="Previous">
              <ChevronLeft size={18} /> Back
            </button>
            <button className="btn primary" onClick={next} aria-label="Next">
              Next <ChevronRight size={18} />
            </button>
          </div>
        </section>
        <section className="pv-side">
          <div className="pv-label">{nextIsStep ? 'Next: animation on this slide' : nextSlide ? 'Next slide' : 'End of slideshow'}</div>
          {nextSlide && (
            <div className="pv-frame small">
              <SlideView deck={deck} slide={nextSlide} mode="present" scale={nextW / deck.size.w} index={deck.slides.indexOf(nextSlide)} step={nextIsStep ? state.step + 1 : 0} />
            </div>
          )}
          <div className="pv-notes-head">
            <span className="pv-label">Notes</span>
            <span>
              <button className="icon-btn light" onClick={() => setNotesSize((n) => Math.max(14, n - 2))} aria-label="Smaller notes">
                <Minus size={14} />
              </button>
              <button className="icon-btn light" onClick={() => setNotesSize((n) => Math.min(48, n + 2))} aria-label="Larger notes">
                <Plus size={14} />
              </button>
            </span>
          </div>
          <div className="pv-notes" style={{ fontSize: notesSize }}>
            {slide?.notes ? slide.notes : <span className="muted">No notes for this slide.</span>}
          </div>
        </section>
      </div>
      <footer className="pv-strip">
        {slides.map((s, i) => (
          <button key={s.id} className={`pv-thumb${i === state.i ? ' on' : ''}`} onClick={() => goto(i)} aria-label={`Go to slide ${i + 1}`}>
            <SlideView deck={deck} slide={s} mode="thumb" scale={120 / deck.size.w} index={deck.slides.indexOf(s)} />
          </button>
        ))}
      </footer>
    </div>
  );
}
