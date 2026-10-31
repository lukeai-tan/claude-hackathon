"""On-page text editor and compact contextual actions."""
import ctypes
import io
import sys
import tkinter as tk
from tkinter import ttk, font as tkfont
import fitz
from PIL import Image, ImageTk
from box_tools import edit_section
from text_tools import font_for


class InlineEditor:
    def __init__(self, app, section):
        self.app, self.section = app, section
        self.index = app.index
        self.rect = fitz.Rect(section['rect'])
        self.font_handle = None
        self.closed = False
        self.widget = None
        self.after_id = None
        style = section['style']
        page = app.pdf.doc[self.index]
        if page.rotation:
            raise ValueError('Rotate the page upright before using inline text editing.')
        face, data, alias = font_for(app.pdf.doc, page, style, section['text'].replace('\n', ''))
        family = style['font'].replace('-', ' ')
        if data and sys.platform == 'win32':
            from fontTools.ttLib import TTFont
            tt = TTFont(io.BytesIO(data))
            family = tt['name'].getDebugName(1) or family
            tt.close()
            self.font_buffer = ctypes.create_string_buffer(data)
            count = ctypes.c_uint()
            add = ctypes.windll.gdi32.AddFontMemResourceEx
            add.restype = ctypes.c_void_p
            add.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
            self.font_handle = add(self.font_buffer, len(data), None, ctypes.byref(count))
        elif alias:
            family = 'Times New Roman' if alias.startswith('ti') else 'Courier New' if alias.startswith('co') else 'Arial'
        self.font = tkfont.Font(root=app, family=family, size=-max(5, round(style['size'] * app.zoom)),
                                weight='bold' if style.get('flags', 0) & 16 else 'normal',
                                slant='italic' if style.get('flags', 0) & 2 else 'roman')
        # Match the dominant local background while editing. Export retains the
        # actual original graphics/image background, including gradients.
        pix = page.get_pixmap(clip=self.rect, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        colors = img.getcolors(img.width * img.height)
        background = '#%02x%02x%02x' % max(colors, key=lambda x: x[0])[1] if colors else '#ffffff'
        # A temporary copy supplies a backdrop without this section, so moving
        # it does not leave a second copy visible at the old position.
        with fitz.open(stream=app.pdf.bytes(), filetype='pdf') as preview:
            edit_section(preview, self.index, section, '')
            pix = preview[self.index].get_pixmap(matrix=fitz.Matrix(app.zoom, app.zoom), alpha=False)
        app.photo = ImageTk.PhotoImage(Image.open(io.BytesIO(pix.tobytes('png'))))
        app.canvas.delete('all')
        app.canvas.create_image(20, 20, anchor='nw', image=app.photo)
        self.widget = tk.Text(app.canvas, font=self.font, foreground=f'#{style["color"]:06x}',
                              background=background, insertbackground=f'#{style["color"]:06x}',
                              selectbackground='#2563eb', selectforeground='white',
                              wrap='word', undo=True, borderwidth=0, highlightthickness=2,
                              highlightbackground='#2563eb', highlightcolor='#2563eb',
                              padx=2, pady=0, spacing1=0, spacing2=0, spacing3=0)
        self.widget.insert('1.0', section['text'])
        self.widget.edit_reset()
        self.window = app.canvas.create_window(self.rect.x0 * app.zoom + 18,
                                               self.rect.y0 * app.zoom + 18,
                                               window=self.widget, anchor='nw', tags='inline')
        self.toolbar = ttk.Frame(app.canvas, padding=3)
        ttk.Button(self.toolbar, text='Apply', command=lambda: app.guard(self.commit)).pack(side='left')
        ttk.Button(self.toolbar, text='Cancel', command=self.cancel).pack(side='left')
        ttk.Label(self.toolbar, text=f'{style["size"]:g} pt · drag blue border to move · corner to resize').pack(side='left', padx=6)
        self.toolbar_id = app.canvas.create_window(self.rect.x0 * app.zoom + 18,
                                                   max(0, self.rect.y0 * app.zoom - 18),
                                                   window=self.toolbar, anchor='nw', tags='inline')
        self.edges = [app.canvas.create_rectangle(0, 0, 0, 0, fill='#2563eb', outline='', tags='inline') for _ in range(4)]
        self.drag = None
        self.handle = app.canvas.create_rectangle(0, 0, 0, 0, fill='#2563eb', outline='white', tags='inline')
        app.canvas.tag_bind(self.handle, '<B1-Motion>', self.resize)
        app.canvas.tag_bind(self.handle, '<ButtonPress-1>', lambda e: 'break')
        self.interactive_items = set(self.edges + [self.handle])
        for edge in self.edges:
            app.canvas.tag_bind(edge, '<ButtonPress-1>', self.start_move)
            app.canvas.tag_bind(edge, '<B1-Motion>', self.move)
            app.canvas.tag_bind(edge, '<Enter>', lambda e: app.canvas.configure(cursor='fleur'))
            app.canvas.tag_bind(edge, '<Leave>', lambda e: app.canvas.configure(cursor=''))
        self.position()
        self.widget.bind('<Control-Return>', lambda e: self.key_commit())
        self.widget.bind('<Escape>', lambda e: self.key_cancel())
        self.widget.bind('<Control-s>', lambda e: self.key_commit())
        self.widget.bind('<Control-z>', lambda e: self.local_undo())
        self.widget.bind('<Control-h>', lambda e: 'break')
        self.widget.bind('<Control-y>', lambda e: self.local_redo())
        self.widget.bind('<Control-f>', app.find_shortcut)
        self.widget.bind('<Control-MouseWheel>', app.wheel)
        self.widget.bind('<<Modified>>', self.modified)
        self.widget.edit_modified(False)
        self.widget.focus_set()
        self.widget.mark_set('insert', 'end-1c')
        self.widget.see('insert')
        app.status.set('Editing directly: type or Backspace to reflow. Click outside / Ctrl+Enter to apply; Escape cancels.')

    def position(self):
        z = self.app.zoom
        canvas = self.app.canvas
        width = max(35, self.rect.width * z + 8)
        height = max(self.font.metrics('linespace') + 6, self.rect.height * z + 6)
        x0, y0 = self.rect.x0 * z + 18, self.rect.y0 * z + 18
        canvas.coords(self.window, x0, y0)
        canvas.itemconfigure(self.window, width=width, height=height)
        for item, coords in zip(self.edges, [(x0-3, y0-3, x0+width+3, y0),
                                             (x0-3, y0+height, x0+width+3, y0+height+3),
                                             (x0-3, y0, x0, y0+height),
                                             (x0+width, y0, x0+width+3, y0+height)]):
            canvas.coords(item, *coords)
            canvas.tag_raise(item)
        x, y = self.rect.x1 * z + 24, self.rect.y1 * z + 24
        self.app.canvas.coords(self.handle, x - 5, y - 5, x + 5, y + 5)
        self.app.canvas.tag_raise(self.handle)
        self.toolbar.update_idletasks()
        left, top = canvas.canvasx(0), canvas.canvasy(0)
        tx = max(left, min(x0, left + canvas.winfo_width() - self.toolbar.winfo_reqwidth() - 8))
        ty = y0 - self.toolbar.winfo_reqheight() - 12
        if ty < top:
            ty = y0 + height + 14
        canvas.coords(self.toolbar_id, tx, ty)
        canvas.tag_raise(self.toolbar_id)

    def start_move(self, event):
        self.drag = (self.app.canvas.canvasx(event.x), self.app.canvas.canvasy(event.y), fitz.Rect(self.rect))
        return 'break'

    def move(self, event):
        if not self.drag:
            return 'break'
        x, y, original = self.drag
        bounds = self.app.pdf.doc[self.index].rect
        dx = max(-original.x0, min(bounds.width - original.x1, (self.app.canvas.canvasx(event.x) - x) / self.app.zoom))
        dy = max(-original.y0, min(bounds.height - original.y1, (self.app.canvas.canvasy(event.y) - y) / self.app.zoom))
        self.rect = original + (dx, dy, dx, dy)
        self.position()
        self.app.status.set('Moving existing PDF text. Click Apply to keep this position; Escape cancels.')
        return 'break'

    def resize(self, event):
        page = self.app.pdf.doc[self.index]
        x = (self.app.canvas.canvasx(event.x) - 24) / self.app.zoom
        y = (self.app.canvas.canvasy(event.y) - 24) / self.app.zoom
        self.rect.x1 = max(self.rect.x0 + 20, min(page.rect.width, x))
        self.rect.y1 = max(self.rect.y0 + 12, min(page.rect.height, y))
        self.position()
        self.app.status.set(f'Text box: {self.rect.width:.0f} × {self.rect.height:.0f} pt. Text wraps live as you resize.')
        return 'break'

    def modified(self, event=None):
        if self.closed or not self.widget.edit_modified():
            return
        self.widget.edit_modified(False)
        text = self.widget.get('1.0', 'end-1c')
        self.app.status.set(f'Editing {len(text)} characters · original {self.section["style"]["size"]:g} pt · Ctrl+Enter applies, Escape cancels.')

    def commit(self):
        if self.closed:
            return
        text = self.widget.get('1.0', 'end-1c')
        app = self.app
        if text == self.section['text'] and tuple(self.rect) == self.section['rect']:
            self.close()
            app.render()
            return
        before = app.pdf.bytes()
        try:
            edit_section(app.pdf.doc, self.index, self.section, text, self.rect)
        except Exception:
            app.pdf.restore(before)
            # Keep the live editor and typed text so the user can correct it.
            raise
        app.history.append(before)
        app.history = app.history[-8:]
        app.redo_history.clear()
        app.dirty = True
        self.close()
        app.refresh()
        app.status.set('Text box updated with its original PDF font and background. Save as to export.')

    def cancel(self):
        self.close()
        self.app.render()
        self.app.status.set('Inline edit cancelled; PDF unchanged.')

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.app.canvas.delete('inline')
        self.app.canvas.configure(cursor='')
        self.widget.destroy()
        self.toolbar.destroy()
        if self.font_handle:
            remove = ctypes.windll.gdi32.RemoveFontMemResourceEx
            remove.argtypes = [ctypes.c_void_p]
            remove(self.font_handle)
        self.app.inline = None

    def key_commit(self):
        self.app.guard(self.commit)
        return 'break'

    def key_cancel(self):
        self.cancel()
        return 'break'

    def local_undo(self):
        try:
            self.widget.edit_undo()
        except tk.TclError:
            pass
        return 'break'

    def local_redo(self):
        try:
            self.widget.edit_redo()
        except tk.TclError:
            pass
        return 'break'
