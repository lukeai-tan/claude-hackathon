import { useMemo } from 'react';
import { CircleAlert, Info, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { editElements, goToSlide } from '../store/actions';
import { colorBehind, runChecksCached, type Issue } from '../doctor/checks';
import { aabb, getLayout, resolveElement } from '../model/resolve';
import { contrastRatio } from '../model/theme';

function focus(issue: Issue) {
  const st = useEditor.getState();
  if (st.slideId !== issue.slideId || st.target.kind !== 'slide') goToSlide(issue.slideId);
  if (issue.elementId) useEditor.setState({ selection: [issue.elementId] });
}

function applyFix(issue: Issue) {
  const deck = useEditor.getState().deck!;
  const slide = deck.slides.find((s) => s.id === issue.slideId);
  if (!slide || !issue.elementId) return;
  focus(issue);
  const layout = getLayout(deck, slide.layoutId);
  const els = slide.elements.map((e) => resolveElement(e, layout));
  const el = els.find((e) => e.id === issue.elementId);
  if (!el) return;
  if (issue.fix === 'offslide') {
    const b = aabb(el);
    const dx = b.x < 0 ? -b.x : b.x + b.w > deck.size.w ? deck.size.w - (b.x + b.w) : 0;
    const dy = b.y < 0 ? -b.y : b.y + b.h > deck.size.h ? deck.size.h - (b.y + b.h) : 0;
    editElements([el.id], (e) => {
      e.x += dx;
      e.y += dy;
      if (b.w > deck.size.w) {
        e.w = deck.size.w * 0.9;
        e.x = deck.size.w * 0.05;
      }
    }, { touches: ['geom'] });
  }
  if (issue.fix === 'contrast' && el.type === 'text') {
    const bg = colorBehind(deck, slide, els, el);
    if (!bg) return;
    const c = deck.theme.colors;
    const candidates: [string, string][] = [
      ['theme:text', c.text],
      ['theme:background', c.background],
      ['theme:primary', c.primary],
      ['#ffffff', '#ffffff'],
      ['#111111', '#111111'],
    ];
    const best = candidates.reduce((a, b) => (contrastRatio(b[1], bg) > contrastRatio(a[1], bg) ? b : a));
    editElements([el.id], (e) => {
      if (e.type === 'text') {
        e.style.color = best[0];
        e.html = e.html.replace(/(^|;|\s)color:\s*[^;"]+;?/g, '$1');
      }
    }, { touches: ['style'] });
  }
  if (issue.fix === 'alt') {
    useEditor.setState({ panel: 'selection' });
    setTimeout(() => (document.getElementById(`alt-${el.id}`) as HTMLTextAreaElement | null)?.focus(), 60);
  }
}

const FIX_LABEL: Record<string, string> = { offslide: 'Move onto slide', contrast: 'Fix colour', alt: 'Add alt text' };

export function CheckPanel() {
  const deck = useEditor((s) => s.deck)!;
  const issues = useMemo(() => runChecksCached(deck), [deck]);
  const counts = { error: 0, warning: 0, tip: 0 };
  issues.forEach((i) => counts[i.severity]++);
  return (
    <div>
      <div className="check-summary">
        {issues.length === 0 ? (
          <p className="ok">
            <CheckCircle2 size={16} /> No problems found. Text is readable, images have alt text and everything sits on the slide.
          </p>
        ) : (
          <p>
            {counts.error} serious, {counts.warning} worth fixing, {counts.tip} tips.
          </p>
        )}
        <p className="muted small">Checks contrast (WCAG 2.1), text size in points, text off the slide, alt text, wordy slides and font count. They run on every change, without AI.</p>
      </div>
      <ul className="issue-list">
        {issues.map((i) => (
          <li key={i.key} className={`issue ${i.severity}`}>
            <button className="issue-main" onClick={() => focus(i)}>
              {i.severity === 'error' ? <CircleAlert size={15} /> : i.severity === 'warning' ? <TriangleAlert size={15} /> : <Info size={15} />}
              <span>
                <span className="issue-slide">Slide {i.slideIndex + 1}</span> {i.message}
              </span>
            </button>
            {i.fix !== 'none' && (
              <button className="btn small" onClick={() => applyFix(i)}>
                {FIX_LABEL[i.fix]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
