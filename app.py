"""OpenPDF Studio: local desktop PDF workstation."""
import io
import queue
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog as fd, simpledialog as sd, messagebox as mb
from pathlib import Path
import webbrowser

import fitz
from PIL import Image, ImageTk
from core import PDF, page_numbers, images_to_pdf, office_to_pdf


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('OpenPDF Studio')
        self.geometry('1280x850')
        self.minsize(950, 650)
        self.pdf = None
        self.path = None
        self.index = 0
        self.zoom = 1.0
        self.history = []
        self.dirty = False
        self.selection = None
        self.busy = False
        self.results = queue.Queue()
        self.status = tk.StringVar(value='Open a PDF to begin. Files stay on your computer.')
        self.page_label = tk.StringVar(value='No document')
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TButton', padding=(10, 6))
        style.configure('Header.TLabel', font=('Segoe UI', 20, 'bold'))
        style.configure('TNotebook.Tab', padding=(12, 8))
        header = ttk.Frame(self, padding=14)
        header.pack(fill='x')
        ttk.Label(header, text='OpenPDF Studio', style='Header.TLabel').pack(side='left')
        ttk.Label(header, text='LOCAL DOCUMENT WORKSPACE').pack(side='right')
        tabs = ttk.Notebook(self)
        tabs.pack(fill='x', padx=12)
        groups = {
            'File': [('Open', self.open), ('Save as', self.save), ('Undo', self.undo),
                     ('New blank', self.new), ('Images to PDF', self.from_images),
                     ('Office to PDF', self.from_office), ('Batch compress', self.batch)],
            'Pages': [('Merge', self.merge), ('Extract / reorder', self.select), ('Split all', self.split),
                      ('Rotate', self.rotate), ('Delete page', self.delete), ('Blank page', self.blank),
                      ('Crop selection', self.crop), ('Bookmark', self.bookmark)],
            'Edit': [('Add text', self.text), ('Replace text', self.replace), ('Add image', self.image),
                     ('Draw signature', self.signature), ('Highlight', self.highlight),
                     ('Comment', self.comment), ('Add link', self.link)],
            'Forms': [('Text field', lambda: self.field(False)), ('Checkbox', lambda: self.field(True)),
                      ('Fill fields', self.fill)],
            'Protect': [('Redact selection', self.redact), ('Remove metadata / attachments', self.sanitize),
                        ('Password export', self.encrypt), ('Metadata', self.metadata)],
            'Convert': [('OCR pages', self.ocr), ('Export Word (text)', self.docx),
                        ('Export text', self.txt), ('Export PNGs', self.png),
                        ('Compare text', self.compare), ('Compressed export', self.save)],
            'Tools': [('Search', self.search), ('Watermark', self.watermark),
                      ('Page numbers', self.numbers), ('Feature status', self.about)],
        }
        for title, actions in groups.items():
            frame = ttk.Frame(tabs, padding=8)
            tabs.add(frame, text=title)
            for label, action in actions:
                ttk.Button(frame, text=label, command=lambda a=action: self.guard(a)).pack(side='left', padx=2)
        body = ttk.PanedWindow(self, orient='horizontal')
        body.pack(fill='both', expand=True, padx=12, pady=10)
        side = ttk.Frame(body, width=180)
        ttk.Label(side, text='PAGES', padding=8).pack(fill='x')
        self.pages = tk.Listbox(side, width=20, font=('Segoe UI', 11), borderwidth=0,
                                selectbackground='#2563eb', exportselection=False)
        self.pages.pack(fill='both', expand=True)
        self.pages.bind('<<ListboxSelect>>', self.go)
        body.add(side, weight=0)
        viewer = ttk.Frame(body)
        nav = ttk.Frame(viewer)
        nav.pack(fill='x')
        for label, command in [('Previous', lambda: self.navigate(-1)), ('Next', lambda: self.navigate(1)),
                               ('Zoom −', lambda: self.scale(0.8)), ('Zoom +', lambda: self.scale(1.25))]:
            ttk.Button(nav, text=label, command=command).pack(side='left', padx=2)
        ttk.Label(nav, textvariable=self.page_label).pack(side='right', padx=10)
        area = ttk.Frame(viewer)
        area.pack(fill='both', expand=True)
        self.canvas = tk.Canvas(area, background='#dce3ed', highlightthickness=0)
        ybar = ttk.Scrollbar(area, orient='vertical', command=self.canvas.yview)
        xbar = ttk.Scrollbar(area, orient='horizontal', command=self.canvas.xview)
        self.canvas.configure(yscrollcommand=ybar.set, xscrollcommand=xbar.set)
        ybar.pack(side='right', fill='y')
        xbar.pack(side='bottom', fill='x')
        self.canvas.pack(fill='both', expand=True)
        self.canvas.bind('<ButtonPress-1>', self.start_selection)
        self.canvas.bind('<B1-Motion>', self.drag_selection)
        body.add(viewer, weight=1)
        ttk.Label(self, textvariable=self.status, padding=10, wraplength=1100).pack(fill='x')
        self.protocol('WM_DELETE_WINDOW', self.quit_app)
        self.bind('<Control-o>', lambda e: self.guard(self.open))
        self.bind('<Control-s>', lambda e: self.guard(self.save))
        self.bind('<Control-z>', lambda e: self.guard(self.undo))
        self.after(100, self.poll)

    def guard(self, action):
        if self.busy:
            return
        try:
            action()
        except Exception as exc:
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
        self.history, self.index, self.dirty = [], 0, False
        self.refresh()
        self.status.set(f'Opened {Path(path).name}. Drag on the page to select an area.')

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
        self.path, self.history, self.index, self.dirty = None, [], 0, True
        self.refresh()

    def output(self, ext):
        return fd.asksaveasfilename(defaultextension=ext, filetypes=[(ext.upper(), '*' + ext)])

    def save(self):
        self.require()
        path = self.output('.pdf')
        if path:
            self.pdf.save(path)
            self.dirty = False
            self.status.set(f'Saved {path}. Export is unencrypted; use Password export to encrypt.')

    def change(self, operation, message='Updated document. Save as to export.'):
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
        self.dirty = True
        self.refresh()
        self.status.set(message)

    def undo(self):
        if self.history:
            self.pdf.restore(self.history.pop())
            self.dirty = True
            self.refresh()

    def refresh(self):
        self.index = max(0, min(self.index, len(self.pdf.doc) - 1))
        self.pages.delete(0, 'end')
        for i in range(len(self.pdf.doc)):
            self.pages.insert('end', f'  Page {i + 1}')
        self.pages.selection_set(self.index)
        self.render()

    def render(self):
        if not self.pdf:
            return
        pix = self.pdf.doc[self.index].get_pixmap(matrix=fitz.Matrix(self.zoom, self.zoom), alpha=False)
        self.photo = ImageTk.PhotoImage(Image.open(io.BytesIO(pix.tobytes('png'))))
        self.canvas.delete('all')
        self.canvas.create_image(20, 20, anchor='nw', image=self.photo)
        self.canvas.configure(scrollregion=(0, 0, pix.width + 40, pix.height + 40))
        self.selection = None
        self.page_label.set(f'Page {self.index + 1} of {len(self.pdf.doc)} · {round(self.zoom * 100)}%')

    def go(self, event=None):
        if self.busy or not self.pages.curselection() or not self.pdf:
            return
        self.index = self.pages.curselection()[0]
        self.render()

    def navigate(self, delta):
        if self.pdf and not self.busy:
            self.index = max(0, min(len(self.pdf.doc) - 1, self.index + delta))
            self.refresh()

    def scale(self, factor):
        if not self.busy:
            self.zoom = max(0.3, min(3, self.zoom * factor))
            self.render()

    def start_selection(self, event):
        if self.busy:
            return
        self.origin = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
        self.canvas.delete('selection')

    def drag_selection(self, event):
        if self.busy or not hasattr(self, 'origin'):
            return
        x, y = self.origin
        x2, y2 = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.canvas.delete('selection')
        self.canvas.create_rectangle(x, y, x2, y2, outline='#2563eb', width=2, tags='selection')
        self.selection = fitz.Rect((min(x, x2) - 20) / self.zoom, (min(y, y2) - 20) / self.zoom,
                                   (max(x, x2) - 20) / self.zoom, (max(y, y2) - 20) / self.zoom)

    def rect(self):
        self.require()
        if self.selection is None or self.selection.is_empty:
            raise ValueError('Drag a rectangle on the page first.')
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
        rect = self.rect()
        text = sd.askstring('Add text', 'Text (basic Latin fonts):', parent=self)
        size = sd.askinteger('Font size', 'Size in points:', initialvalue=12, minvalue=4, maxvalue=144, parent=self) if text else None
        if text and size:
            self.change(lambda: self.pdf.insert_text(self.index, rect, text, size))

    def replace(self):
        self.require()
        old = sd.askstring('Replace text', 'Find on current page:', parent=self)
        if not old:
            return
        new = sd.askstring('Replace text', 'Replace with (fixed original bounds; no paragraph reflow):', parent=self)
        size = sd.askinteger('Font size', 'Replacement font size:', initialvalue=10, minvalue=4, parent=self) if new is not None else None
        if new is not None and size:
            self.change(lambda: self.pdf.replace_text(self.index, old, new, size))

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
        text = sd.askstring('Highlight', 'Text on current page:', parent=self)
        if text:
            self.change(lambda: self.pdf.highlight(self.index, text))

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
        rect = self.rect()
        if mb.askyesno('Redact', 'Remove text, image pixels, and intersecting graphics in this area? Save as a new file afterward.', parent=self):
            self.change(lambda: self.pdf.redact(self.index, rect), 'Area redacted. Save as to write a cleaned PDF. Other copies and metadata are separate.')

    def sanitize(self):
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
            self.pdf.export_docx(path)
            self.status.set('Word text exported. Complex layout, images, tables, and fonts are not reconstructed.')

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
        text = sd.askstring('Search', 'Search all pages:', parent=self)
        if text:
            hits = [i + 1 for i, p in enumerate(self.pdf.doc) if p.search_for(text)]
            self.status.set('Found on pages: ' + ', '.join(map(str, hits)) if hits else 'No matches. Scans may need OCR.')
            if hits:
                self.index = hits[0] - 1
                self.refresh()

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
        mb.showinfo('Feature status', 'OpenPDF Studio — AGPL-3.0-or-later\n\n'
                    'Local PDF tools, OCR, editable text/checkbox forms, annotations, visual signatures, '
                    'AES-256 export, redaction, text comparison, page management, and batch compression.\n\n'
                    'Word export is text-only. Replacement text uses fixed bounds and a basic font. '
                    'OCR rasterizes selected pages. Compression may not reduce every file.\n\n'
                    'Not implemented: certificate signatures, remote signer identities/delivery/audit service, '
                    'real-time collaboration, exact Word layout reconstruction, XFA forms, PDF/A validation, '
                    'accessibility remediation, AI chat.\n\n'
                    'Office import needs LibreOffice. Windows bundle includes English Tesseract OCR.', parent=self)

    def quit_app(self):
        if self.busy:
            mb.showinfo('Working', 'Wait for the current operation to finish.', parent=self)
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
        app.update()
        app.destroy()
    else:
        App().mainloop()
