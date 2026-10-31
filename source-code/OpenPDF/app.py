"""OpenPDF Studio: local desktop PDF workstation."""
import io
import queue
import sys
import os
import traceback
import threading
import tkinter as tk
from tkinter import ttk, filedialog as fd, simpledialog as sd, messagebox as mb, colorchooser
from pathlib import Path
import webbrowser

# Windowed executables have no standard streams. Some conversion dependencies
# write progress output; give them a real stream and retain diagnostic failures.
if '--self-test' in sys.argv:
    sys.stdout = open('smoke-output.log', 'w', encoding='utf-8', buffering=1)
    sys.stderr = sys.stdout
    def test_exception(kind, value, tb):
        traceback.print_exception(kind, value, tb, file=sys.stderr)
        sys.stderr.flush()
        os._exit(1)
    sys.excepthook = test_exception
elif sys.stdout is None or sys.stderr is None:
    _log_folder = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'OpenPDFStudio'
    _log_folder.mkdir(parents=True, exist_ok=True)
    _log = open(_log_folder / 'app.log', 'a', encoding='utf-8', buffering=1)
    sys.stdout = sys.stdout or _log
    sys.stderr = sys.stderr or _log

import fitz
from PIL import Image, ImageTk
from core import PDF, page_numbers, images_to_pdf, office_to_pdf
from text_tools import find_matches, replace_match, select_text, lines
from box_tools import text_sections
from inline_editor import InlineEditor
from rich_editor import RichBoxEditor
from rich_boxes import boxes, new_box, move_page, apply_redactions
from thumbnails import Thumbnails
from pen_tools import add_stroke
from render_tools import PageCache, pixmap_image
from ui_tools import enable_dpi_awareness
from studio_ui import build_workspace


class App(tk.Tk):
    def __init__(self):
        enable_dpi_awareness()
        super().__init__()
        self.title('OpenPDF | OpenSuite')
        self.geometry('1440x900')
        self.minsize(1000, 700)
        self.pdf = None
        self.path = None
        self.index = 0
        self.zoom = 1.0
        self.history = []
        self.redo_history = []
        self.dirty = False
        self.selection = None
        self.inline = None
        self.view_cache = PageCache()
        self.context_frame = None
        self.selected_text = ''
        self.search_query = ''
        self.search_matches = []
        self.search_position = 0
        self.search_window = None
        self.text_quads = []
        self.ink_points = None
        self.ink_color = '#7054d7'
        self.ink_width = tk.StringVar(value='2.5')
        self.ink_color_label = tk.StringVar(value='Ink: #7054d7')
        self.selection_mode = tk.StringVar(value='text')
        self.busy = False
        self.results = queue.Queue()
        self.status = tk.StringVar(value='Open a PDF to begin. Files stay on your computer.')
        self.test_error = None
        if '--self-test' in sys.argv:
            def record_error(kind, value, tb):
                self.test_error = value
                traceback.print_exception(kind, value, tb, file=sys.stderr)
            self.report_callback_exception = record_error
        self.page_label = tk.StringVar(value='No document')
        build_workspace(self)
        self.protocol('WM_DELETE_WINDOW', self.quit_app)
        self.bind('<Control-o>', lambda e: self.guard(self.open))
        self.bind('<Control-s>', lambda e: self.guard(self.save))
        self.bind('<Control-z>', lambda e: self.guard(self.undo))
        self.bind('<Control-y>', lambda e: self.guard(self.redo))
        self.bind('<Control-Shift-Z>', lambda e: self.guard(self.redo))
        self.bind('<Control-f>', self.find_shortcut)
        self.bind('<Control-MouseWheel>', self.wheel)
        self.bind('<Control-Button-4>', self.wheel)
        self.bind('<Control-Button-5>', self.wheel)
        self.bind('<Control-h>', lambda e: self.guard(self.highlight))
        self.bind('<Escape>', self.escape_mode)
        self.after(100, self.poll)

    def guard(self, action):
        if self.busy:
            return
        try:
            if self.inline and action != self.inline.commit:
                self.inline.commit()
            action()
        except Exception as exc:
            if '--self-test' in sys.argv:
                raise
            mb.showerror('Operation could not complete', str(exc), parent=self)
            self.status.set(str(exc))

    def require(self):
        if not self.pdf or not len(self.pdf.doc):
            raise ValueError('Open a PDF first.')

    def confirm_discard(self):
        return not self.dirty or mb.askyesno('Unsaved changes', 'Discard unsaved changes?', parent=self)

    def load(self, path):
        password = ''
        with fitz.open(path) as probe:
            if probe.needs_pass:
                password = sd.askstring('Password', 'Document password:', show='*', parent=self)
                if password is None:
                    return
        loaded = PDF(path, password)
        if self.pdf:
            self.pdf.close()
        self.pdf, self.path = loaded, path
        self.history, self.redo_history, self.index, self.dirty = [], [], 0, False
        self.search_query = ''
        self.refresh()
        self.status.set(f'Opened {Path(path).name}. Drag to select text; switch to Select area for placement/cropping.')

    def open(self):
        if not self.confirm_discard():
            return
        path = fd.askopenfilename(filetypes=[('PDF documents', '*.pdf')])
        if path:
            self.load(path)

    def new(self):
        if not self.confirm_discard():
            return
        if self.pdf:
            self.pdf.close()
        self.pdf = PDF()
        self.pdf.doc.new_page()
        self.path, self.history, self.redo_history, self.index, self.dirty = None, [], [], 0, True
        self.search_query = ''
        self.refresh()

    def output(self, ext):
        return fd.asksaveasfilename(defaultextension=ext, filetypes=[(ext.upper(), '*' + ext)])

    def save(self):
        self.require()
        path = self.output('.pdf')
        if path:
            self.pdf.save(path)
            self.dirty = False
            self.path = path
            self.update_document_header()
            self.status.set(f'Saved {path}. Export is unencrypted; use Password export to encrypt.')

    def change(self, operation, message='Updated document. Save as to export.', dirty_pages=None):
        self.require()
        before = self.pdf.bytes()
        try:
            operation()
        except Exception:
            self.pdf.restore(before)
            self.refresh()
            raise
        self.history.append(before)
        self.history = self.history[-8:]
        self.redo_history.clear()
        self.dirty = True
        self.refresh(dirty_pages=dirty_pages)
        self.status.set(message)

    def undo(self):
        if self.history:
            self.redo_history.append(self.pdf.bytes())
            self.pdf.restore(self.history.pop())
            self.dirty = True
            self.refresh()

    def redo(self):
        if self.redo_history:
            self.history.append(self.pdf.bytes())
            self.history = self.history[-8:]
            self.pdf.restore(self.redo_history.pop())
            self.dirty = True
            self.refresh()

    def native_sections(self):
        return self.view_cache.get(self.pdf.doc, 'sections', self.index,
                                   lambda: text_sections(self.pdf.doc[self.index]))

    def text_lines(self, index):
        return self.view_cache.get(self.pdf.doc, 'lines', index, lambda: lines(self.pdf.doc[index]))

    def find_cached(self, query, page_indices=None):
        return find_matches(self.pdf.doc, query, page_indices=page_indices, line_provider=self.text_lines)

    def update_document_header(self):
        name = Path(self.path).name if self.path else 'Untitled.pdf'
        self.document_label.set(name if len(name) < 30 else name[:26] + '…')
        self.save_label.set('Unsaved changes' if self.dirty else 'Saved locally')
        self.title(f'{name}{" •" if self.dirty else ""} | OpenPDF')

    def fit_page(self):
        self.require()
        page = self.pdf.doc[self.index].rect
        self.zoom = max(.3, min(3, (self.canvas.winfo_width()-50)/page.width, (self.canvas.winfo_height()-50)/page.height))
        self.render()
        self.canvas.xview_moveto(0)
        self.canvas.yview_moveto(0)

    def refresh(self, dirty_pages=None):
        self.update_document_header()
        self.index = max(0, min(self.index, len(self.pdf.doc) - 1))
        self.view_cache.sync(self.pdf.doc)
        self.view_cache.invalidate(dirty_pages)
        self.pages.refresh(self.pdf, self.index, dirty_pages=dirty_pages)
        if dirty_pages is None:
            self.search_matches = self.find_cached(self.search_query)
        else:
            matches = [m for m in self.search_matches if m['page'] not in dirty_pages]
            matches.extend(self.find_cached(self.search_query, sorted(dirty_pages)))
            self.search_matches = sorted(matches, key=lambda m: (m['page'], m['rect'][1], m['rect'][0]))
        self.search_position = min(self.search_position, max(0, len(self.search_matches) - 1))
        self.render()

    def render(self):
        if not self.pdf or self.inline:
            return
        self.cancel_stroke()
        self.canvas.configure(cursor='crosshair' if self.selection_mode.get() in ('pen', 'addbox') else '')
        self.hide_context()
        def raster():
            pix = self.pdf.doc[self.index].get_pixmap(matrix=fitz.Matrix(self.zoom, self.zoom), alpha=False)
            return ImageTk.PhotoImage(pixmap_image(pix))
        self.photo = self.view_cache.get(self.pdf.doc, 'image', self.index, raster, round(self.zoom, 6))
        self.canvas.delete('all')
        self.canvas.create_rectangle(25, 25, self.photo.width()+25, self.photo.height()+25, fill='#d6d2df', outline='')
        self.canvas.create_image(20, 20, anchor='nw', image=self.photo)
        self.canvas.configure(scrollregion=(0, 0, self.photo.width() + 40, self.photo.height() + 40))
        self.selection = None
        self.text_quads = []
        self.page_label.set(f'Page {self.index + 1} of {len(self.pdf.doc)} · {round(self.zoom * 100)}%')
        for n, match in enumerate(self.search_matches):
            if match['page'] != self.index:
                continue
            r = fitz.Rect(match['rect']) * self.pdf.doc[self.index].rotation_matrix
            self.canvas.create_rectangle(r.x0 * self.zoom + 20, r.y0 * self.zoom + 20,
                                         r.x1 * self.zoom + 20, r.y1 * self.zoom + 20,
                                         fill='#fbbf24', stipple='gray50', outline='#ea580c' if n == self.search_position else '',
                                         width=2, tags='search-result')
        if self.selection_mode.get() == 'edit':
            for section in self.native_sections() + boxes(self.pdf.doc[self.index]):
                r = fitz.Rect(section['rect']) * self.pdf.doc[self.index].rotation_matrix
                self.canvas.create_rectangle(r.x0 * self.zoom + 20, r.y0 * self.zoom + 20,
                                             r.x1 * self.zoom + 20, r.y1 * self.zoom + 20,
                                             outline='#60a5fa', dash=(4, 3), tags='text-box')

    def go(self, event=None):
        if self.busy or self.pages.selected() is None or not self.pdf:
            return
        target = self.pages.selected()
        if target == self.index:
            return
        if self.inline:
            try:
                self.inline.commit()
            except Exception as exc:
                self.pages.select(self.index)
                mb.showerror('Finish this edit', str(exc), parent=self)
                return
        self.index = target
        self.render()

    def reorder_page(self, source, target):
        def reorder():
            def operation():
                move_page(self.pdf.doc, source, target)
                self.index = target
            self.change(operation, f'Moved page {source + 1} to position {target + 1}. Undo restores the page order.')
        self.guard(reorder)

    def navigate(self, delta):
        if self.pdf and not self.busy:
            if self.inline:
                self.guard(self.inline.commit)
                if self.inline:
                    return
            self.index = max(0, min(len(self.pdf.doc) - 1, self.index + delta))
            self.pages.select(self.index)
            self.render()

    def scale(self, factor):
        if not self.busy:
            if self.inline:
                self.guard(self.inline.commit)
                if self.inline:
                    return
            self.zoom = max(0.3, min(3, self.zoom * factor))
            self.render()

    def wheel(self, event):
        up = getattr(event, 'num', None) == 4 or getattr(event, 'delta', 0) > 0
        if event.state & 0x4:
            self.scale(1.1 if up else 1 / 1.1)
        elif event.widget is self.canvas:
            self.canvas.yview_scroll(-3 if up else 3, 'units')
        return 'break'

    def find_shortcut(self, event=None):
        self.guard(self.search)
        return 'break'

    def start_selection(self, event):
        if self.busy:
            return
        self.hide_context()
        if self.inline:
            current = self.canvas.find_withtag('current')
            if current and current[0] in getattr(self.inline, 'interactive_items', {self.inline.handle}):
                return
            self.guard(self.inline.commit)
            if self.inline:
                return
        if self.selection_mode.get() == 'pen':
            self.guard(lambda: self.begin_stroke(event))
            return
        if self.pdf and self.selection_mode.get() == 'edit':
            point = fitz.Point((self.canvas.canvasx(event.x) - 20) / self.zoom,
                               (self.canvas.canvasy(event.y) - 20) / self.zoom) * self.pdf.doc[self.index].derotation_matrix
            for box in reversed(boxes(self.pdf.doc[self.index])):
                if fitz.Rect(box['rect']).contains(point):
                    self.guard(lambda: self.begin_box(box))
                    return
            for section in reversed(self.native_sections()):
                if fitz.Rect(section['rect']).contains(point):
                    self.guard(lambda: self.begin_inline(section))
                    break
            return
        self.origin = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
        self.canvas.delete('selection')
        self.text_quads = []
        self.selection = None

    def clear_selection(self):
        if self.inline:
            self.guard(self.inline.commit)
            if self.inline:
                self.selection_mode.set('edit')
                return
        self.cancel_stroke()
        self.canvas.configure(cursor='crosshair' if self.selection_mode.get() == 'pen' else '')
        self.hide_context()
        self.canvas.delete('selection')
        self.canvas.delete('text-box')
        self.text_quads = []
        self.selection = None

    def drag_selection(self, event):
        if self.selection_mode.get() == 'pen':
            if not self.busy:
                self.extend_stroke(event)
            return
        if self.busy or self.inline or self.selection_mode.get() == 'edit' or not hasattr(self, 'origin'):
            return
        x, y = self.origin
        x2, y2 = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.canvas.delete('selection')
        if self.selection_mode.get() == 'text' and self.pdf:
            page = self.pdf.doc[self.index]
            start = fitz.Point((x - 20) / self.zoom, (y - 20) / self.zoom) * page.derotation_matrix
            end = fitz.Point((x2 - 20) / self.zoom, (y2 - 20) / self.zoom) * page.derotation_matrix
            self.text_quads, text = select_text(page, start, end, self.text_lines(self.index))
            self.selected_text = text
            for quad in self.text_quads:
                r = quad.rect * page.rotation_matrix
                self.canvas.create_rectangle(r.x0 * self.zoom + 20, r.y0 * self.zoom + 20,
                                             r.x1 * self.zoom + 20, r.y1 * self.zoom + 20,
                                             fill='#93c5fd', stipple='gray50', outline='', tags='selection')
            self.status.set(f'Selected: {text[:160]} — Highlight or Ctrl+H to mark only this selection.')
            return
        self.canvas.create_rectangle(x, y, x2, y2, outline='#2563eb', width=2, tags='selection')
        self.selection = fitz.Rect((min(x, x2) - 20) / self.zoom, (min(y, y2) - 20) / self.zoom,
                                   (max(x, x2) - 20) / self.zoom, (max(y, y2) - 20) / self.zoom)

    def edit_mode(self):
        self.require()
        self.selection_mode.set('edit')
        self.render()
        self.status.set('Edit text boxes: click an outlined section and type directly. Click outside to apply; Escape cancels.')

    def begin_inline(self, section):
        self.hide_context()
        self.clear_selection()
        self.inline = InlineEditor(self, section)

    def begin_box(self, box):
        self.hide_context()
        self.clear_selection()
        self.selection_mode.set('edit')
        self.inline = RichBoxEditor(self, box)

    def hide_context(self):
        self.canvas.delete('context')
        if self.context_frame:
            self.context_frame.destroy()
            self.context_frame = None

    def selection_popup(self, event=None):
        if self.selection_mode.get() == 'pen':
            if self.ink_points and not self.busy:
                self.extend_stroke(event)
                points, index = list(self.ink_points), self.ink_page
                color, width = self.stroke_color, self.stroke_width
                self.cancel_stroke()
                self.guard(lambda: self.change(lambda: add_stroke(self.pdf.doc[index], points, color, width),
                                               'Pen stroke added. Keep drawing; Undo removes the last stroke. Escape exits Pen.', dirty_pages={index}))
            return
        if self.selection_mode.get() == 'addbox' and self.pdf and not self.inline and not self.busy:
            def create():
                rect = self.rect()
                if rect.width < 24 or rect.height < 24:
                    raise ValueError('Drag a larger text box (at least 24 × 24 points).')
                self.begin_box(new_box(rect))
            if self.selection:
                self.guard(create)
            return
        if self.inline or self.busy or not self.text_quads or not self.pdf:
            return
        self.hide_context()
        self.context_frame = ttk.Frame(self.canvas, padding=3)
        text = self.selected_text
        def copy():
            self.clipboard_clear()
            self.clipboard_append(text)
            self.hide_context()
        def edit():
            for box in reversed(boxes(self.pdf.doc[self.index])):
                if all(fitz.Rect(box['rect']).contains(q.rect) for q in self.text_quads):
                    self.begin_box(box)
                    return
            sections = self.native_sections()
            candidates = [s for s in sections if all(fitz.Rect(s['rect']).contains(q.rect) for q in self.text_quads)]
            if len(candidates) != 1:
                raise ValueError('Select text within a single section to edit it, or use Edit text boxes.')
            self.begin_inline(candidates[0])
        for title, action in [('Edit section', edit), ('Highlight', self.highlight), ('Redact', self.redact), ('Copy', copy), ('Cancel', self.clear_selection)]:
            ttk.Button(self.context_frame, text=title, command=lambda a=action: self.guard(a)).pack(side='left')
        r = self.text_quads[-1].rect * self.pdf.doc[self.index].rotation_matrix
        self.canvas.create_window(max(self.canvas.canvasx(0), r.x0 * self.zoom + 20), r.y1 * self.zoom + 26,
                                  anchor='nw', window=self.context_frame, tags='context')

    def rect(self):
        self.require()
        if self.selection is None or self.selection.is_empty:
            raise ValueError('Choose Select area, then drag a rectangle on the page.')
        page = self.pdf.doc[self.index]
        r = self.selection & page.rect
        if r.is_empty:
            raise ValueError('Select an area inside the page.')
        return r * page.derotation_matrix

    def merge(self):
        self.require()
        paths = fd.askopenfilenames(filetypes=[('PDF', '*.pdf')])
        if paths:
            self.change(lambda: self.pdf.merge(paths))

    def select(self):
        self.require()
        spec = sd.askstring('Extract / reorder', 'Pages in desired order (duplicates allowed), e.g. 3,1-2:', parent=self)
        if spec:
            self.change(lambda: self.pdf.select(spec))

    def split(self):
        self.require()
        folder = fd.askdirectory()
        if folder:
            if any(Path(folder).glob('page-*.pdf')):
                raise ValueError('Choose a folder without existing page-*.pdf files.')
            self.pdf.split(folder)
            self.status.set('Exported one PDF per page.')

    def rotate(self):
        self.change(lambda: self.pdf.doc[self.index].set_rotation((self.pdf.doc[self.index].rotation + 90) % 360))

    def delete(self):
        self.require()
        if len(self.pdf.doc) == 1:
            raise ValueError('Keep at least one page.')
        self.change(lambda: self.pdf.doc.delete_page(self.index))

    def blank(self):
        self.change(lambda: self.pdf.doc.new_page(pno=self.index + 1))

    def crop(self):
        rect = self.rect()
        page = self.pdf.doc[self.index]
        # CropBox is expressed relative to the media box, not the current crop.
        rect += (page.cropbox.x0, page.cropbox.y0, page.cropbox.x0, page.cropbox.y0)
        self.change(lambda: self.pdf.doc[self.index].set_cropbox(rect))

    def text(self):
        self.require()
        if self.pdf.doc[self.index].rotation:
            raise ValueError('Rotate the page upright before adding a text box.')
        self.clear_selection()
        self.selection_mode.set('addbox')
        self.render()
        self.status.set('Add text box: drag a rectangle on the page, then type. Drag its blue border to move it.')

    def pen_mode(self):
        self.require()
        self.pen_width_value()
        self.clear_selection()
        self.selection_mode.set('pen')
        self.render()
        self.status.set('Pen: hold the left mouse button and scribble. Draw tools change colour/thickness. Escape exits; Undo removes a stroke.')

    def pen_width_value(self):
        try:
            value = float(self.ink_width.get())
            if not .5 <= value <= 20:
                raise ValueError()
            return value
        except ValueError:
            raise ValueError('Choose a pen thickness between 0.5 and 20 points.') from None

    def pen_color(self):
        color = colorchooser.askcolor(parent=self, color=self.ink_color, title='Pen ink colour')[1]
        if color:
            self.ink_color = color
            self.ink_color_label.set('Ink: ' + color)

    def stop_pen(self):
        self.cancel_stroke()
        self.selection_mode.set('text')
        self.clear_selection()
        self.render()
        self.status.set('Text selection enabled.')

    def escape_mode(self, event=None):
        if self.ink_points:
            self.cancel_stroke()
            self.status.set('Unfinished stroke cancelled. Pen remains active.')
        elif self.selection_mode.get() in ('pen', 'addbox'):
            self.stop_pen()
        return 'break'

    def cancel_stroke(self):
        self.ink_points = None
        self.canvas.delete('ink-preview')

    def begin_stroke(self, event):
        self.require()
        self.cancel_stroke()
        self.stroke_width = self.pen_width_value()
        self.stroke_color = self.ink_color
        self.ink_page = self.index
        x = (self.canvas.canvasx(event.x) - 20) / self.zoom
        y = (self.canvas.canvasy(event.y) - 20) / self.zoom
        page = self.pdf.doc[self.index]
        if not page.rect.contains(fitz.Point(x, y)):
            return
        point = fitz.Point(x, y) * page.derotation_matrix
        self.ink_points = [tuple(point)]
        self.ink_preview = self.canvas.create_line(x * self.zoom + 20, y * self.zoom + 20,
                                                   x * self.zoom + 20.01, y * self.zoom + 20,
                                                   fill=self.stroke_color, width=self.stroke_width * self.zoom,
                                                   capstyle='round', joinstyle='round', tags='ink-preview')

    def extend_stroke(self, event):
        if not self.ink_points or not event or self.ink_page != self.index:
            return
        page = self.pdf.doc[self.index]
        x = max(0, min(page.rect.width, (self.canvas.canvasx(event.x) - 20) / self.zoom))
        y = max(0, min(page.rect.height, (self.canvas.canvasy(event.y) - 20) / self.zoom))
        point = fitz.Point(x, y) * page.derotation_matrix
        if point.distance_to(fitz.Point(self.ink_points[-1])) < .25:
            return
        self.ink_points.append(tuple(point))
        screen = [fitz.Point(p) * page.rotation_matrix for p in self.ink_points]
        self.canvas.coords(self.ink_preview, *[v * self.zoom + 20 for p in screen for v in p])

    def replace(self):
        self.require()
        window = tk.Toplevel(self)
        window.title('Find and replace one match')
        window.geometry('600x420')
        window.transient(self)
        owner = self.pdf
        query, replacement = tk.StringVar(), tk.StringVar()
        details = tk.StringVar(value='Search the whole document, then select a match.')
        top = ttk.Frame(window, padding=12)
        top.pack(fill='x')
        ttk.Label(top, text='Find').grid(row=0, column=0, sticky='w')
        entry = ttk.Entry(top, textvariable=query, width=36)
        entry.grid(row=0, column=1, padx=8)
        ttk.Label(top, text='Replace with').grid(row=1, column=0, sticky='w', pady=8)
        ttk.Entry(top, textvariable=replacement, width=36).grid(row=1, column=1, padx=8)
        listing = ttk.Frame(window, padding=(12, 0))
        listing.pack(fill='both', expand=True)
        matches_list = tk.Listbox(listing, exportselection=False)
        scroll = ttk.Scrollbar(listing, command=matches_list.yview)
        matches_list.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        matches_list.pack(fill='both', expand=True)
        ttk.Label(window, textvariable=details, padding=12, wraplength=570).pack(fill='x')
        actions = ttk.Frame(window, padding=10)
        actions.pack(fill='x')
        state = {'matches': [], 'index': 0}
        def display(event=None):
            if not matches_list.curselection() or self.pdf is not owner:
                return
            n = matches_list.curselection()[0]
            state['index'] = n
            match = state['matches'][n]
            self.index = match['page']
            self.pages.select(self.index)
            self.render()
            r = fitz.Rect(match['rect']) * self.pdf.doc[self.index].rotation_matrix
            coords = [r.x0 * self.zoom + 20, r.y0 * self.zoom + 20,
                      r.x1 * self.zoom + 20, r.y1 * self.zoom + 20]
            self.canvas.create_rectangle(*coords, outline='#f97316', width=3, tags='selection')
            bounds = self.canvas.bbox('all')
            self.canvas.yview_moveto(max(0, (coords[1] - self.canvas.winfo_height() / 3) / max(1, bounds[3])))
            self.canvas.xview_moveto(max(0, (coords[0] - self.canvas.winfo_width() / 3) / max(1, bounds[2])))
            style = match['style']
            details.set(f'Match {n + 1}/{len(state["matches"])} · Page {match["page"] + 1}\n'
                        f'{style["font"]} · {style["size"]:g} pt · #{style["color"]:06X}\n'
                        'Original baseline, font, size and colour are reused. Background is preserved.')
        def search():
            if self.pdf is not owner:
                window.destroy()
                return
            state['matches'] = self.find_cached(query.get())
            matches_list.delete(0, 'end')
            for i, match in enumerate(state['matches']):
                matches_list.insert('end', f'{i + 1}. Page {match["page"] + 1} — {match["context"][:90]}')
            if state['matches']:
                n = min(state['index'], len(state['matches']) - 1)
                matches_list.selection_set(n)
                matches_list.see(n)
                display()
            else:
                details.set('No matches. Scanned pages may need OCR first.')
        def step(delta):
            if state['matches']:
                n = (state['index'] + delta) % len(state['matches'])
                matches_list.selection_clear(0, 'end')
                matches_list.selection_set(n)
                matches_list.see(n)
                display()
        def apply():
            if self.busy or self.pdf is not owner or not state['matches']:
                return
            selected = state['matches'][state['index']]
            # Another edit may have occurred while this nonmodal dialog was open.
            fresh = self.find_cached(selected['text'], [selected['page']])
            if not any(m['page'] == selected['page'] and m['rect'] == selected['rect'] and m['style'] == selected['style'] for m in fresh):
                search()
                raise ValueError('Document changed. Review the refreshed match before replacing.')
            self.change(lambda: replace_match(owner.doc, selected, replacement.get()), 'Replaced one selected match using its original styling.', dirty_pages={selected['page']})
            search()
        ttk.Button(top, text='Find matches', command=lambda: self.guard(search)).grid(row=0, column=2)
        ttk.Button(actions, text='Previous', command=lambda: step(-1)).pack(side='left')
        ttk.Button(actions, text='Next', command=lambda: step(1)).pack(side='left', padx=6)
        ttk.Button(actions, text='Replace selected', command=lambda: self.guard(apply)).pack(side='right')
        matches_list.bind('<<ListboxSelect>>', display)
        entry.bind('<Return>', lambda e: self.guard(search))
        entry.focus_set()

    def image(self):
        rect = self.rect()
        path = fd.askopenfilename(filetypes=[('Images', '*.png *.jpg *.jpeg')])
        if path:
            self.change(lambda: self.pdf.add_image(self.index, rect, path))

    def signature(self):
        rect = self.rect()
        window = tk.Toplevel(self)
        window.title('Draw a signature — visual mark, not a certificate signature')
        canvas = tk.Canvas(window, width=600, height=200, bg='white')
        canvas.pack()
        from PIL import ImageDraw
        img = Image.new('RGBA', (600, 200), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        last = [None]
        def start(e):
            last[0] = (e.x, e.y)
        def move(e):
            if last[0]:
                points = [last[0], (e.x, e.y)]
                canvas.create_line(*last[0], e.x, e.y, width=3, fill='#14213d')
                draw.line(points, fill=(20, 33, 61, 255), width=3)
            last[0] = (e.x, e.y)
        def apply():
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            self.guard(lambda: self.change(lambda: self.pdf.doc[self.index].insert_image(rect, stream=buffer.getvalue())))
            window.destroy()
        canvas.bind('<Button-1>', start)
        canvas.bind('<B1-Motion>', move)
        ttk.Button(window, text='Place signature', command=apply).pack(pady=8)
        window.grab_set()

    def highlight(self):
        self.require()
        if not self.text_quads:
            raise ValueError('Choose Select text and drag across the characters you want to highlight.')
        quads = list(self.text_quads)
        self.change(lambda: self.pdf.doc[self.index].add_highlight_annot(quads), 'Highlighted only the selected text.', dirty_pages={self.index})

    def comment(self):
        rect = self.rect()
        text = sd.askstring('Comment', 'Comment:', parent=self)
        if text:
            self.change(lambda: self.pdf.doc[self.index].add_text_annot(rect.tl, text))

    def link(self):
        rect = self.rect()
        url = sd.askstring('Add link', 'https:// URL:', parent=self)
        if url:
            if not url.startswith(('https://', 'http://')):
                raise ValueError('Use an http:// or https:// URL.')
            self.change(lambda: self.pdf.doc[self.index].insert_link({'kind': fitz.LINK_URI, 'from': rect, 'uri': url}))

    def field(self, checkbox):
        rect = self.rect()
        name = sd.askstring('Form field', 'Unique field name:', parent=self)
        if name:
            self.change(lambda: self.pdf.add_field(self.index, rect, name, checkbox))

    def fill(self):
        self.require()
        fields = self.pdf.fields()
        if not fields:
            raise ValueError('No interactive fields. Add a text field or checkbox first.')
        values = []
        for index, name, value, kind in fields:
            if kind not in (fitz.PDF_WIDGET_TYPE_TEXT, fitz.PDF_WIDGET_TYPE_CHECKBOX):
                continue
            new = sd.askstring('Fill form', f'Page {index + 1}: {name}' + (' (yes/no)' if kind == fitz.PDF_WIDGET_TYPE_CHECKBOX else ''),
                               initialvalue=str(value or ''), parent=self)
            if new is None:
                return
            values.append((index, name, new))
        self.change(lambda: [self.pdf.fill_field(*v) for v in values])

    def redact(self):
        self.require()
        if self.text_quads:
            quads = list(self.text_quads)
            if mb.askyesno('Redact selected text', 'Permanently remove the selected characters in the exported PDF?', parent=self):
                def remove():
                    page = self.pdf.doc[self.index]
                    for quad in quads:
                        r = quad.rect + (0.05, 0.05, -0.05, -0.05)
                        page.add_redact_annot(r, fill=(0, 0, 0))
                    apply_redactions(page, images=0, graphics=0, text=0)
                self.change(remove, 'Selected text redacted. Save as to export the cleaned PDF.', dirty_pages={self.index})
            return
        rect = self.rect()
        if mb.askyesno('Redact', 'Remove text, image pixels, and intersecting graphics in this area? Save as a new file afterward.', parent=self):
            self.change(lambda: self.pdf.redact(self.index, rect), 'Area redacted. Save as to write a cleaned PDF. Other copies and metadata are separate.')

    def sanitize(self):
        self.require()
        self.change(self.pdf.sanitize, 'Document metadata and embedded file attachments removed.')

    def encrypt(self):
        self.require()
        password = sd.askstring('Encrypt export', 'Password required to open the exported PDF:', show='*', parent=self)
        if not password:
            return
        confirm = sd.askstring('Confirm password', 'Enter password again:', show='*', parent=self)
        if password != confirm:
            raise ValueError('Passwords do not match.')
        path = self.output('.pdf')
        if path:
            self.pdf.save(path, password)
            self.status.set('Saved AES-256 encrypted copy.')

    def metadata(self):
        self.require()
        data = dict(self.pdf.doc.metadata)
        for key in ('title', 'author', 'subject', 'keywords'):
            value = sd.askstring('Metadata', key.title(), initialvalue=data.get(key, ''), parent=self)
            if value is None:
                return
            data[key] = value
        self.change(lambda: self.pdf.doc.set_metadata(data))

    def background(self, work, done, message):
        self.busy = True
        self.status.set(message)
        def run():
            try:
                self.results.put((done, work(), None))
            except Exception as exc:
                self.results.put((done, None, exc))
        threading.Thread(target=run, daemon=True).start()

    def poll(self):
        try:
            done, value, error = self.results.get_nowait()
            self.busy = False
            if error:
                self.status.set(str(error))
                mb.showerror('Operation failed', str(error), parent=self)
            else:
                self.guard(lambda: done(value))
        except queue.Empty:
            pass
        self.after(100, self.poll)

    def ocr(self):
        self.require()
        spec = sd.askstring('OCR', 'Pages to OCR (selected pages become searchable raster pages; forms/links there are lost):',
                            initialvalue=str(self.index + 1), parent=self)
        if not spec:
            return
        indices = page_numbers(spec, len(self.pdf.doc))
        before = self.pdf.bytes()
        def work():
            worker = PDF()
            try:
                worker.restore(before)
                worker.ocr(indices)
                return worker.bytes()
            finally:
                worker.close()
        self.background(work, lambda data: self.change(lambda: self.pdf.restore(data), 'OCR complete. Save as to export.'), 'Running OCR…')

    def docx(self):
        self.require()
        path = self.output('.docx')
        if path:
            snapshot = self.pdf.bytes()
            def work():
                worker = PDF()
                try:
                    worker.restore(snapshot)
                    worker.export_docx(path)
                finally:
                    worker.close()
            self.background(work, lambda _: self.status.set('Editable Word document exported with reconstructed formatting, tables and images. Review complex layouts in Word.'),
                            'Reconstructing editable Word layout…')

    def txt(self):
        self.require()
        path = self.output('.txt')
        if path:
            self.pdf.export_text(path)
            self.status.set('Text exported.')

    def png(self):
        self.require()
        folder = fd.askdirectory()
        if folder:
            if any(Path(folder).glob('page-*.png')):
                raise ValueError('Choose a folder without existing page-*.png files.')
            self.pdf.export_images(folder)
            self.status.set('Rendered pages exported as PNGs.')

    def compare(self):
        self.require()
        other = fd.askopenfilename(filetypes=[('PDF', '*.pdf')])
        path = self.output('.html') if other else None
        if path:
            self.pdf.compare(other, path)
            webbrowser.open(Path(path).resolve().as_uri())
            self.status.set('Text comparison opened. Image/layout changes are not included; OCR scans first.')

    def from_images(self):
        paths = fd.askopenfilenames(filetypes=[('Images', '*.png *.jpg *.jpeg *.tif *.tiff')])
        path = self.output('.pdf') if paths else None
        if path:
            images_to_pdf(paths, path)
            self.status.set(f'Created {path}')

    def from_office(self):
        path = fd.askopenfilename(filetypes=[('Office documents', '*.docx *.doc *.xlsx *.pptx *.odt')])
        folder = fd.askdirectory() if path else None
        if folder:
            if (Path(folder) / (Path(path).stem + '.pdf')).exists():
                raise ValueError('Output already exists. Choose a different folder.')
            self.background(lambda: office_to_pdf(path, folder), lambda p: self.status.set(f'Created {p}'), 'Converting with LibreOffice…')

    def batch(self):
        paths = fd.askopenfilenames(filetypes=[('PDF', '*.pdf')])
        folder = fd.askdirectory() if paths else None
        if not folder:
            return
        targets = [Path(folder) / (Path(p).stem + '-compressed.pdf') for p in paths]
        if len(set(targets)) != len(targets) or any(p.exists() for p in targets):
            raise ValueError('Output names overlap or already exist. Choose unique filenames and a new folder.')
        def work():
            for path, target in zip(paths, targets):
                pdf = PDF(path)
                try:
                    pdf.save(target)
                finally:
                    pdf.close()
            return len(paths)
        self.background(work, lambda n: self.status.set(f'Compressed {n} PDFs. Already optimized files may not shrink.'), 'Compressing PDFs…')

    def search(self):
        self.require()
        if self.search_window and self.search_window.winfo_exists():
            self.search_window.lift()
            self.find_entry.focus_set()
            return
        window = tk.Toplevel(self)
        self.search_window = window
        window.title('Find text · Ctrl+F')
        window.transient(self)
        window.resizable(False, False)
        frame = ttk.Frame(window, padding=12)
        frame.pack()
        query = tk.StringVar(value=self.search_query)
        result = tk.StringVar(value='Type to highlight matching words on the page.')
        self.find_entry = ttk.Entry(frame, textvariable=query, width=32)
        self.find_entry.grid(row=0, column=0, columnspan=3, sticky='ew', pady=5)
        pending = [None]
        def show(delta=0):
            if self.busy or self.inline:
                return
            if self.search_matches:
                self.search_position = (self.search_position + delta) % len(self.search_matches)
                match = self.search_matches[self.search_position]
                self.index = match['page']
                self.pages.select(self.index)
                self.render()
                r = fitz.Rect(match['rect']) * self.pdf.doc[self.index].rotation_matrix
                bounds = self.canvas.bbox('all')
                self.canvas.yview_moveto(max(0, (r.y0 * self.zoom + 20 - self.canvas.winfo_height() / 3) / max(1, bounds[3])))
                self.canvas.xview_moveto(max(0, (r.x0 * self.zoom + 20 - self.canvas.winfo_width() / 3) / max(1, bounds[2])))
                result.set(f'{self.search_position + 1} of {len(self.search_matches)} · Page {self.index + 1}')
            else:
                self.render()
                result.set('No matches. Scanned pages may need OCR.')
        def perform():
            pending[0] = None
            if not self.pdf or self.busy:
                return
            self.search_query = query.get()
            self.search_matches = self.find_cached(self.search_query)
            self.search_position = 0
            show()
        def changed(*_):
            if pending[0]:
                self.after_cancel(pending[0])
            pending[0] = self.after(200, perform)
        def close():
            if pending[0]:
                self.after_cancel(pending[0])
            self.search_query, self.search_matches = '', []
            self.search_window = None
            window.destroy()
            self.render()
        query.trace_add('write', changed)
        ttk.Button(frame, text='Previous', command=lambda: show(-1)).grid(row=1, column=0)
        ttk.Button(frame, text='Next', command=lambda: show(1)).grid(row=1, column=1)
        ttk.Button(frame, text='Close', command=close).grid(row=1, column=2)
        ttk.Label(frame, textvariable=result).grid(row=2, column=0, columnspan=3, pady=8)
        self.find_entry.bind('<Return>', lambda e: show(1))
        window.bind('<Escape>', lambda e: close())
        window.protocol('WM_DELETE_WINDOW', close)
        self.find_entry.focus_set()
        if self.search_query:
            perform()

    def watermark(self):
        self.require()
        text = sd.askstring('Watermark', 'Watermark text:', parent=self)
        if text:
            self.change(lambda: self.pdf.watermark(text))

    def numbers(self):
        self.require()
        self.change(self.pdf.number_pages)

    def bookmark(self):
        self.require()
        name = sd.askstring('Bookmark', 'Title for this page:', parent=self)
        if name:
            self.change(lambda: self.pdf.doc.set_toc(self.pdf.doc.get_toc() + [[1, name, self.index + 1]]))

    def about(self):
        mb.showinfo('Feature status', 'OpenPDF · OpenSuite — AGPL-3.0-or-later\n\n'
                    'Local PDF tools, OCR, editable text/checkbox forms, annotations, visual signatures, '
                    'AES-256 export, redaction, text comparison, page management, and batch compression.\n\n'
                    'Word export reconstructs editable layout; complex designs may differ. Replacement reuses embedded fonts, size and colour. '
                    'OCR rasterizes selected pages. Compression may not reduce every file.\n\n'
                    'Not implemented: certificate signatures, remote signer identities/delivery/audit service, '
                    'real-time collaboration, guaranteed exact Word layout reconstruction, XFA forms, PDF/A validation, '
                    'accessibility remediation, AI chat.\n\n'
                    'Office import needs LibreOffice. Windows bundle includes English Tesseract OCR.', parent=self)

    def quit_app(self):
        if self.busy:
            mb.showinfo('Working', 'Wait for the current operation to finish.', parent=self)
        elif self.inline:
            self.guard(self.inline.commit)
            if not self.inline:
                self.quit_app()
        elif self.confirm_discard():
            if self.pdf:
                self.pdf.close()
            self.destroy()


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            pdf = PDF()
            pdf.doc.new_page().insert_text((72, 72), 'OpenPDF executable smoke test')
            path = str(Path(folder) / 'smoke.pdf')
            pdf.save(path)
            pdf.close()
            with fitz.open(path) as check:
                assert 'smoke test' in check[0].get_text()
        app = App()
        from gui_smoke import exercise_app
        exercise_app(app)
        if app.test_error:
            raise app.test_error
        app.update()
        app.destroy()
    else:
        App().mainloop()

