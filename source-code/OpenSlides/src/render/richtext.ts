import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'ul', 'ol', 'li', 'div', 'font', 'sup', 'sub'];

export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['style', 'color', 'face', 'size'] });
  return normalize(clean);
}

/** Converts browser-specific markup (font tags, stray divs) into p/span markup. */
function normalize(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('font').forEach((f) => {
    const span = document.createElement('span');
    const color = f.getAttribute('color');
    const face = f.getAttribute('face');
    if (color) span.style.color = color;
    if (face) span.style.fontFamily = face;
    span.setAttribute('style', [span.getAttribute('style'), f.getAttribute('style')].filter(Boolean).join(';'));
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
  // Top-level divs become paragraphs; loose top-level text gets wrapped.
  const children = Array.from(root.childNodes);
  let pending: HTMLParagraphElement | null = null;
  for (const node of children) {
    const isBlock = node.nodeType === 1 && ['P', 'UL', 'OL', 'DIV'].includes((node as Element).tagName);
    if (isBlock) {
      pending = null;
      if ((node as Element).tagName === 'DIV') {
        const p = document.createElement('p');
        p.setAttribute('style', (node as Element).getAttribute('style') ?? '');
        if (!p.getAttribute('style')) p.removeAttribute('style');
        while (node.firstChild) p.appendChild(node.firstChild);
        (node as Element).replaceWith(p);
      }
    } else {
      if (node.nodeType === 3 && !node.textContent) continue;
      if (!pending) {
        pending = document.createElement('p');
        root.insertBefore(pending, node);
      }
      pending.appendChild(node);
    }
  }
  return root.innerHTML;
}

const PROP_TAGS: Record<string, string[]> = {
  'font-weight': ['B', 'STRONG'],
  'font-style': ['I', 'EM'],
  'text-decoration': ['U', 'S', 'STRIKE'],
  'text-decoration-line': ['U', 'S', 'STRIKE'],
};

/** Removes an inline CSS property (and equivalent tags) so an element-level style applies everywhere. */
export function stripInline(html: string, props: string[]): string {
  if (!html) return html;
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(html);
  root.querySelectorAll<HTMLElement>('[style]').forEach((n) => {
    for (const p of props) n.style.removeProperty(p);
    if (!n.getAttribute('style')) n.removeAttribute('style');
  });
  const tags = props.flatMap((p) => PROP_TAGS[p] ?? []);
  if (tags.length) {
    root.querySelectorAll(tags.join(',')).forEach((n) => {
      const parent = n.parentNode!;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    });
  }
  root.querySelectorAll('span:not([style])').forEach((n) => {
    const parent = n.parentNode!;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  });
  return root.innerHTML;
}

/** Scales every inline font-size (px) in the markup, used by magic resize. */
export function scaleInlineFontSizes(html: string, k: number): string {
  return html.replace(/font-size:\s*([\d.]+)px/g, (_, n) => `font-size: ${Math.round(parseFloat(n) * k)}px`);
}

// ---------- live editing helpers (operate on the focused contentEditable) ----------

export function exec(cmd: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, value);
}

/** Applies a pixel font size to the current selection inside a contentEditable. */
export function applyFontSizeToSelection(editor: HTMLElement, px: number) {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand('fontSize', false, '7');
  editor.querySelectorAll<HTMLElement>('span[style*="xxx-large"], font[size="7"]').forEach((n) => {
    if (n.tagName === 'FONT') {
      const span = document.createElement('span');
      while (n.firstChild) span.appendChild(n.firstChild);
      n.replaceWith(span);
      span.style.fontSize = `${px}px`;
    } else {
      n.style.fontSize = `${px}px`;
    }
  });
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function activeEditor(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (el && el.isContentEditable && el.dataset.richtext === 'true') return el;
  return null;
}

/** Reads basic formatting state at the caret for toolbar highlighting. */
export function queryState() {
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strike: document.queryCommandState('strikeThrough'),
    ul: document.queryCommandState('insertUnorderedList'),
    ol: document.queryCommandState('insertOrderedList'),
  };
}

// ---------- selection memory, so toolbar inputs can apply styles after taking focus ----------

let savedRange: Range | null = null;
let savedEditor: HTMLElement | null = null;

export function rememberSelection(editor: HTMLElement) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedRange = sel.getRangeAt(0).cloneRange();
    savedEditor = editor;
  }
}

/** Refocuses the text being edited, restores its selection and runs fn. Returns false if nothing is being edited. */
export function withEditor(fn: (editor: HTMLElement) => void): boolean {
  let editor = activeEditor();
  if (!editor && savedEditor && document.body.contains(savedEditor)) {
    editor = savedEditor;
    editor.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange);
    }
  }
  if (!editor) return false;
  fn(editor);
  rememberSelection(editor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function forgetSelection() {
  savedRange = null;
  savedEditor = null;
}
