import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Asset, Deck, EditTarget, Slide, SlideElement } from '../model/types';

export type Panel = 'selection' | 'slide' | 'design' | 'check' | 'outline';
export type Dialog = null | 'resize' | 'chart' | 'shortcuts' | 'layouts';
export type StudioTab = 'templates' | 'elements' | 'text' | 'themes' | 'uploads' | 'ai' | 'agents';

export interface Guide {
  axis: 'x' | 'y';
  pos: number; // slide-space coordinate
  from: number;
  to: number;
}

export interface EditorState {
  deck: Deck | null;
  past: Deck[];
  future: Deck[];
  slideId: string | null;
  selection: string[];
  editingId: string | null;
  target: EditTarget;
  panel: Panel;
  zoom: number; // 0 = fit to window
  guides: Guide[];
  clipboard: { elements: SlideElement[]; assets: Record<string, Asset> } | null;
  dialog: Dialog;
  chartEditId: string | null;
  notesOpen: boolean;
  toast: string | null;
  studioTab: StudioTab | null;
  inspectorOpen: boolean;
}

const initial: EditorState = {
  deck: null,
  past: [],
  future: [],
  slideId: null,
  selection: [],
  editingId: null,
  target: { kind: 'slide' },
  panel: 'selection',
  zoom: 0,
  guides: [],
  clipboard: null,
  dialog: null,
  chartEditId: null,
  notesOpen: false,
  toast: null,
  studioTab: 'elements',
  inspectorOpen: false,
};

export const useEditor = create<EditorState>(() => ({ ...initial }));

const get = () => useEditor.getState();
const set = (p: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => useEditor.setState(p as any);

const HISTORY_LIMIT = 80;

export function openDeck(deck: Deck) {
  set({ ...initial, deck, slideId: deck.slides[0]?.id ?? null, notesOpen: get().notesOpen });
}

export function closeDeck() {
  set({ ...initial });
}

/** Saves the current deck to the undo stack. Call once before a run of non-history mutations. */
export function checkpoint() {
  const { deck, past } = get();
  if (!deck) return;
  set({ past: [...past, deck].slice(-HISTORY_LIMIT), future: [] });
}

/** Applies an immer recipe to the deck. history=true records an undo step first. */
export function mutate(recipe: (d: Draft<Deck>) => void, history = true) {
  const { deck } = get();
  if (!deck) return;
  if (history) checkpoint();
  const next = produce(deck, (d) => {
    recipe(d);
  });
  if (next !== deck) set({ deck: next });
}

export function undo() {
  const { past, deck, future } = get();
  if (!past.length || !deck) return;
  const prev = past[past.length - 1];
  set({ deck: prev, past: past.slice(0, -1), future: [deck, ...future], editingId: null });
  sanitizeSelection();
}

export function redo() {
  const { past, deck, future } = get();
  if (!future.length || !deck) return;
  const next = future[0];
  set({ deck: next, past: [...past, deck], future: future.slice(1), editingId: null });
  sanitizeSelection();
}

function sanitizeSelection() {
  const s = get();
  if (!s.deck) return;
  if (s.slideId && !s.deck.slides.some((x) => x.id === s.slideId)) set({ slideId: s.deck.slides[0]?.id ?? null });
  const els = currentElements();
  set({ selection: s.selection.filter((id) => els.some((e) => e.id === id)) });
}

export function setToast(msg: string | null, ms = 2600) {
  set({ toast: msg });
  if (msg) {
    const at = msg;
    setTimeout(() => {
      if (get().toast === at) set({ toast: null });
    }, ms);
  }
}

// ---------- selectors ----------

export function currentSlide(s: EditorState = get()): Slide | null {
  if (!s.deck) return null;
  return s.deck.slides.find((x) => x.id === s.slideId) ?? s.deck.slides[0] ?? null;
}

/** Elements of whatever is being edited: the current slide or a layout (master). */
export function currentElements(s: EditorState = get()): SlideElement[] {
  if (!s.deck) return [];
  if (s.target.kind === 'layout') {
    const id = s.target.layoutId;
    return s.deck.layouts.find((l) => l.id === id)?.elements ?? [];
  }
  return currentSlide(s)?.elements ?? [];
}

/** Draft-side version of currentElements for use inside mutate recipes. */
export function draftElements(d: Draft<Deck>, s: EditorState = get()): Draft<SlideElement>[] {
  if (s.target.kind === 'layout') {
    const id = s.target.layoutId;
    return d.layouts.find((l) => l.id === id)?.elements ?? [];
  }
  const slide = d.slides.find((x) => x.id === s.slideId) ?? d.slides[0];
  return slide?.elements ?? [];
}
