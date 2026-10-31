import { ChevronDown, ChevronUp, StickyNote } from 'lucide-react';
import { checkpoint, currentSlide, mutate, useEditor } from '../store/editor';

export function NotesPane() {
  const open = useEditor((s) => s.notesOpen);
  const target = useEditor((s) => s.target);
  useEditor((s) => s.deck);
  const slide = currentSlide();
  if (target.kind === 'layout' || !slide) return null;
  return (
    <div className={`notes${open ? ' open' : ''}`}>
      <button className="notes-toggle" onClick={() => useEditor.setState({ notesOpen: !open })} aria-expanded={open}>
        <StickyNote size={14} /> Speaker notes {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <textarea
          key={slide.id}
          className="notes-text"
          placeholder="What you want to say on this slide. Only you see these in presenter view."
          value={slide.notes}
          onFocus={checkpoint}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            mutate((d) => {
              const s = d.slides.find((x) => x.id === slide.id);
              if (s) s.notes = v;
            }, false);
          }}
        />
      )}
    </div>
  );
}
