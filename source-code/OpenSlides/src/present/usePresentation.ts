import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Deck, Slide } from '../model/types';
import { getLayout, resolveElement } from '../model/resolve';
import { buildPlan } from '../render/builds';
import { loadDeck } from '../store/storage';
import { useEditor } from '../store/editor';

export interface ShowState {
  i: number; // index into the visible slides
  step: number;
  animateStep: number | null;
  black: boolean;
  ended: boolean;
}

export type ShowMsg =
  | { type: 'state'; state: ShowState }
  | { type: 'nav'; dir: 'next' | 'prev' | 'first' | 'last' | 'black' }
  | { type: 'hello' };

export function channelName(id: string) {
  return `deckforge-show-${id}`;
}

export function useDeck(id: string) {
  const [deck, setDeck] = useState<Deck | null | undefined>(() => {
    const d = useEditor.getState().deck;
    return d && d.id === id ? d : undefined;
  });
  useEffect(() => {
    if (deck) return;
    loadDeck(id).then((d) => setDeck(d ?? null));
  }, [id, deck]);
  return deck;
}

export function stepsFor(deck: Deck, slide: Slide): number {
  const layout = getLayout(deck, slide.layoutId);
  return buildPlan(slide.elements.map((e) => resolveElement(e, layout))).steps;
}

export function usePresentation(deck: Deck | null | undefined, startOriginalIndex: number) {
  const slides = useMemo(() => {
    if (!deck) return [];
    const vis = deck.slides.filter((s) => !s.hidden);
    return vis.length ? vis : deck.slides;
  }, [deck]);
  const initial = useMemo(() => {
    if (!deck) return 0;
    const target = deck.slides[startOriginalIndex];
    const idx = target ? slides.indexOf(target) : -1;
    return idx >= 0 ? idx : 0;
  }, [deck, slides, startOriginalIndex]);
  const [state, setState] = useState<ShowState>({ i: initial, step: 0, animateStep: 0, black: false, ended: false });
  useEffect(() => setState((s) => ({ ...s, i: initial, step: 0, animateStep: 0 })), [initial]);

  const next = useCallback(() => {
    if (!deck) return;
    setState((s) => {
      if (s.black) return { ...s, black: false };
      if (s.ended) return s;
      const slide = slides[s.i];
      if (slide && s.step < stepsFor(deck, slide)) return { ...s, step: s.step + 1, animateStep: s.step + 1 };
      if (s.i < slides.length - 1) return { ...s, i: s.i + 1, step: 0, animateStep: 0 };
      return { ...s, ended: true };
    });
  }, [deck, slides]);

  const prev = useCallback(() => {
    if (!deck) return;
    setState((s) => {
      if (s.black) return { ...s, black: false };
      if (s.ended) return { ...s, ended: false };
      if (s.step > 0) return { ...s, step: s.step - 1, animateStep: null };
      if (s.i > 0) {
        const p = slides[s.i - 1];
        return { ...s, i: s.i - 1, step: stepsFor(deck, p), animateStep: null };
      }
      return s;
    });
  }, [deck, slides]);

  const goto = useCallback((i: number) => setState((s) => ({ ...s, i: Math.max(0, Math.min(slides.length - 1, i)), step: 0, animateStep: 0, ended: false, black: false })), [slides.length]);
  const toggleBlack = useCallback(() => setState((s) => ({ ...s, black: !s.black })), []);

  return { slides, state, setState, next, prev, goto, toggleBlack };
}

/** Standard slideshow keys. Returns true if the key was handled. */
export function handleShowKey(e: KeyboardEvent, api: { next: () => void; prev: () => void; goto: (i: number) => void; toggleBlack: () => void; count: number; exit: () => void }) {
  const k = e.key;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) {
    e.preventDefault();
    api.next();
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) {
    e.preventDefault();
    api.prev();
  } else if (k === 'Home') api.goto(0);
  else if (k === 'End') api.goto(api.count - 1);
  else if (k === 'b' || k === 'B' || k === '.') api.toggleBlack();
  else if (k === 'Escape') api.exit();
  else if (k === 'f' || k === 'F') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } else return false;
  return true;
}

export function useWindowSize() {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setS({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}
