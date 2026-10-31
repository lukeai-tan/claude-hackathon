import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FolderOpen, Plus, Trash2 } from 'lucide-react';
import type { Deck } from '../model/types';
import { TEMPLATES, createFromTemplate } from '../model/templates';
import { SlideView } from '../render/SlideView';
import { deleteDeck, listDecks, saveDeck } from '../store/storage';
import { exportDeckFile, readDeckFile, DECK_FILE_EXT } from '../io/deckfile';
import { navigate } from '../router';
import { uid } from '../model/factory';

function Thumb({ deck, width }: { deck: Deck; width: number }) {
  const slide = deck.slides[0] ?? null;
  return (
    <div className="thumb-wrap" style={{ width, height: (width * deck.size.h) / deck.size.w }}>
      <SlideView deck={deck} slide={slide} mode="thumb" scale={width / deck.size.w} index={0} />
    </div>
  );
}

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'Edited just now';
  if (s < 3600) return `Edited ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `Edited ${Math.round(s / 3600)} h ago`;
  return `Edited ${new Date(t).toLocaleDateString()}`;
}

export function Home() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => TEMPLATES.map((t) => ({ t, deck: createFromTemplate(t.id) })), []);

  const refresh = () => listDecks().then(setDecks).catch(() => setError('This browser blocked local storage, so decks can’t be saved. Turn off private browsing and reload.'));
  useEffect(() => {
    refresh();
    document.title = 'OpenSlides';
  }, []);

  const create = async (templateId: string) => {
    const deck = createFromTemplate(templateId);
    await saveDeck(deck);
    navigate(`#/d/${deck.id}`);
  };

  const importFile = async (file: File) => {
    try {
      setError(null);
      if (/\.pptx$/i.test(file.name)) {
        setBusy(true);
        const { importPptx } = await import('../io/importPptx');
        const { deck, skipped } = await importPptx(file);
        await saveDeck(deck);
        sessionStorage.setItem(
          'deckforge-notice',
          `Imported ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'} from PowerPoint.${skipped.length ? ` Not carried over: ${skipped.join(', ')}.` : ''}`,
        );
        navigate(`#/d/${deck.id}`);
        return;
      }
      const deck = await readDeckFile(file);
      await saveDeck(deck);
      navigate(`#/d/${deck.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="wordmark">
          <img src="favicon.svg" alt="" width={30} height={30} />
          <span>OpenSlides</span>
        </div>
        <p className="home-tag">Design like Canva, control like PowerPoint. Works offline, exports real .pptx files, free and open source.</p>
        <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FolderOpen size={16} /> {busy ? 'Opening…' : 'Open PowerPoint or deck file'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={`.pptx,.json,${DECK_FILE_EXT}`}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button className="btn small ghost" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="home-section">
        <h2>Start a new deck</h2>
        <div className="template-row">
          {previews.map(({ t, deck }) => (
            <button key={t.id} className="template-card" onClick={() => create(t.id)}>
              <Thumb deck={deck} width={240} />
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2>Your decks</h2>
        {decks === null ? (
          <p className="muted">Loading…</p>
        ) : decks.length === 0 ? (
          <div className="empty">
            <p>No decks yet. Pick a starting point above, or open a PowerPoint (.pptx) or {DECK_FILE_EXT} file.</p>
            <button className="btn primary" onClick={() => create('blank')}>
              <Plus size={16} /> New blank deck
            </button>
          </div>
        ) : (
          <div className="deck-grid">
            {decks.map((d) => (
              <div key={d.id} className="deck-card">
                <button className="deck-open" onClick={() => navigate(`#/d/${d.id}`)} aria-label={`Open ${d.title}`}>
                  <Thumb deck={d} width={260} />
                </button>
                <div className="deck-meta">
                  <div>
                    <div className="deck-title">{d.title || 'Untitled deck'}</div>
                    <div className="muted small">
                      {d.slides.length} slide{d.slides.length === 1 ? '' : 's'}, {timeAgo(d.updatedAt)}
                    </div>
                  </div>
                  <div className="deck-actions">
                    <button
                      className="icon-btn"
                      title="Duplicate"
                      aria-label="Duplicate deck"
                      onClick={async () => {
                        await saveDeck({ ...structuredClone(d), id: uid(), title: `${d.title} copy`, createdAt: Date.now(), updatedAt: Date.now() });
                        refresh();
                      }}
                    >
                      <Copy size={15} />
                    </button>
                    <button className="icon-btn" title="Download deck file" aria-label="Download deck file" onClick={() => exportDeckFile(d)}>
                      <Download size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete"
                      aria-label="Delete deck"
                      onClick={async () => {
                        if (!confirm(`Delete “${d.title}”? This can’t be undone.`)) return;
                        await deleteDeck(d.id);
                        refresh();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <footer className="home-foot muted small">
        Decks are saved in this browser only. Download a deck file to back it up or move it to another device. MIT licensed.
      </footer>
    </div>
  );
}
