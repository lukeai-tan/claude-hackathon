import { useEffect, useState } from 'react';
import { currentSlide, openDeck, redo, setToast, undo, useEditor } from '../store/editor';
import { flushSave, loadDeck } from '../store/storage';
import {
  clearSelection,
  copySelection,
  deleteSelection,
  duplicateSelection,
  exitLayoutEditing,
  goToSlide,
  groupSelection,
  insertImageFiles,
  nudge,
  pasteClipboard,
  reorder,
  selectAll,
  toggleLock,
  ungroupSelection,
  addElements,
} from '../store/actions';
import { TopBar } from './TopBar';
import { SlidePanel } from './SlidePanel';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { ContextBar } from './ContextBar';
import { NotesPane } from './NotesPane';
import { Dialogs } from './Dialogs';
import { navigate } from '../router';
import { makeText, paragraphs } from '../model/factory';
import type { Asset, SlideElement } from '../model/types';
import { StudioSidebar } from '../studio/StudioSidebar';
import '../styles/studio.css';

const CLIP_MIME = 'application/x-deckforge';

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function useShortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useEditor.getState();
      if (!st.deck) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }
      if (mod && k === 'l') {
        e.preventDefault();
        toggleLock();
        return;
      }
      if (mod && k === 'enter') {
        e.preventDefault();
        const s = currentSlide();
        navigate(`#/present/${st.deck.id}?s=${s ? st.deck.slides.indexOf(s) : 0}`);
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        navigate(`#/present/${st.deck.id}?s=0`);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection.length) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (st.selection.length) clearSelection();
        else if (st.target.kind === 'layout') exitLayoutEditing();
        return;
      }
      if (e.key === 'Enter' && st.selection.length === 1) {
        const el = (st.target.kind === 'layout' ? st.deck.layouts.find((l) => l.id === (st.target as any).layoutId)?.elements : currentSlide()?.elements)?.find((x) => x.id === st.selection[0]);
        if (el && (el.type === 'text' || el.type === 'table') && !el.locked) {
          e.preventDefault();
          useEditor.setState({ editingId: el.id });
        }
        return;
      }
      if (e.key.startsWith('Arrow')) {
        if (st.selection.length) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        } else if (st.target.kind === 'slide' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const s = currentSlide();
          const i = s ? st.deck.slides.indexOf(s) : 0;
          const next = st.deck.slides[Math.max(0, Math.min(st.deck.slides.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))];
          if (next) goToSlide(next.id);
        }
        return;
      }
      if (e.key === ']') {
        reorder(mod ? 'front' : 'forward');
        return;
      }
      if (e.key === '[') {
        reorder(mod ? 'back' : 'backward');
        return;
      }
      if (e.key === '?') useEditor.setState({ dialog: 'shortcuts' });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

function useClipboard() {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      const st = useEditor.getState();
      if (!st.selection.length) return;
      copySelection(cut);
      const clip = useEditor.getState().clipboard;
      if (clip && e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', '[deckforge elements]');
        try {
          e.clipboardData.setData(CLIP_MIME, JSON.stringify(clip));
        } catch {
          /* custom types unsupported: the in-app clipboard still works */
        }
      }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      if (!useEditor.getState().deck || !e.clipboardData) return;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        insertImageFiles(files);
        return;
      }
      const custom = e.clipboardData.getData(CLIP_MIME);
      if (custom) {
        e.preventDefault();
        try {
          const clip = JSON.parse(custom) as { elements: SlideElement[]; assets: Record<string, Asset> };
          useEditor.setState({ clipboard: clip });
          pasteClipboard();
        } catch {
          pasteClipboard();
        }
        return;
      }
      const text = e.clipboardData.getData('text/plain');
      if (text === '[deckforge elements]') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (text.trim()) {
        e.preventDefault();
        const d = useEditor.getState().deck!;
        const u = Math.min(d.size.w, d.size.h) / 1080;
        const el = makeText(d.size.w * 0.2, d.size.h * 0.4, d.size.w * 0.6, 60 * u, paragraphs(text.trim().slice(0, 5000)), { fontSize: Math.round(36 * u) });
        addElements([el]);
      }
    };
    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', paste);
    };
  }, []);
}

function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  );
}

export function EditorPage({ id }: { id: string }) {
  const deck = useEditor((s) => s.deck);
  const studioTab = useEditor((s) => s.studioTab);
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    loadDeck(id)
      .then((d) => {
        if (!alive) return;
        if (d) {
          openDeck(d);
          const notice = sessionStorage.getItem('deckforge-notice');
          if (notice) {
            sessionStorage.removeItem('deckforge-notice');
            setToast(notice, 7000);
          }
        } else setMissing(true);
      })
      .catch(() => setMissing(true));
    return () => {
      alive = false;
      flushSave();
    };
  }, [id]);
  useEffect(() => {
    if (deck) document.title = `${deck.title || 'Untitled deck'} | OpenSlides`;
  }, [deck?.title]);
  useShortcuts();
  useClipboard();

  if (missing) {
    return (
      <div className="center-msg">
        <p>This deck isn’t saved in this browser. Decks live on the device where they were made.</p>
        <button className="btn primary" onClick={() => navigate('#/')}>
          Go to your decks
        </button>
      </div>
    );
  }
  if (!deck || deck.id !== id) return <div className="center-msg muted">Opening deck…</div>;

  return (
    <div className={`editor studio-editor${studioTab ? ' has-studio' : ''}${inspectorOpen ? ' has-inspector' : ''}`}>
      <TopBar />
      <div className="editor-body">
        <StudioSidebar />
        <main className="center-col">
          <ContextBar />
          <Canvas />
          <NotesPane />
          <SlidePanel />
        </main>
        {inspectorOpen && <Inspector />}
      </div>
      <Dialogs />
      <Toast />
    </div>
  );
}

