from pdf_layout import ResponsiveToolbar, visible_toolbar_y
"""Live, selectable styled text inside movable PDF boxes."""
from copy import deepcopy
import io
import time
import tkinter as tk
from tkinter import ttk, colorchooser, font as tkfont
import fitz
from PIL import Image, ImageTk
from rich_boxes import DEFAULT_STYLE, put_box, delete_box, without_boxes, fit_box
from render_tools import pixmap_image
from ui_tools import TextCaret


def editor_button(parent, **kwargs):
    kwargs.setdefault('width', 0)
    return ttk.Button(parent, style='Editor.TButton', **kwargs)


class RichBoxEditor:
    def __init__(self, app, box):
        self.app, self.index = app, app.index
        self.box = deepcopy(box)
        self.original = deepcopy(box)
        self.rect = fitz.Rect(box['rect'])
        self.closed = False
        self.pending_position = None
        self.pending_fit = None
        self.last_size = None
        self.last_align = None
        self.last_typing_checkpoint = 0
        self.styles, self.fonts = {}, []
        self.font_cache = {}
        self.default = dict(DEFAULT_STYLE, **box.get('default', {}))
        self.insertion_style = deepcopy(self.default)
        self.drag = None
        self.local_history, self.local_future = [], []
        page = app.pdf.doc[self.index]
        self.bounds = fitz.Rect(page.rect)
        if page.rotation:
            raise ValueError('Rotate the page upright before editing text boxes.')
        # Show the real page underneath while the box is being moved. Restore
        # its drawing stream immediately; the live editor alone is temporary.
        with without_boxes(page, {box['id']}):
            pix = page.get_pixmap(matrix=fitz.Matrix(app.zoom, app.zoom), alpha=False)
        self.backdrop = pixmap_image(pix)
        app.photo = ImageTk.PhotoImage(self.backdrop)
        app.canvas.delete('all')
        app.canvas.create_image(20, 20, anchor='nw', image=app.photo)
        self.widget = tk.Text(app.canvas, wrap='word', undo=False, exportselection=False,
                              borderwidth=0, highlightthickness=0, padx=4, pady=4,
                              selectbackground='#8061e5', selectforeground='white')
        self.widget.configure(font=self.make_font(self.default), foreground=self.default['color'])
        self.widget.tag_configure('alignment', justify=box['align'])
        for run in box['runs']:
            self.widget.insert('end', run['text'], (self.style_tag(run['style']), 'alignment'))
        self.window = app.canvas.create_window(0, 0, window=self.widget, anchor='nw', tags='inline')
        self.toolbar = ttk.Frame(app.canvas, padding=3)
        row = ttk.Frame(self.toolbar)
        row.pack(fill='x')
        for title, action in [('Apply', self.key_commit), ('Cancel', self.cancel), ('Delete box', self.remove)]:
            editor_button(row, text=title, command=action, takefocus=False).pack(side='left', padx=2)
        ttk.Label(self.toolbar, text='Drag border to move; corner to resize.', wraplength=400).pack(anchor='w', pady=2)
        row = ttk.Frame(self.toolbar)
        row.pack(fill='x')
        self.family = tk.StringVar(value=self.default['family'])
        combo = ttk.Combobox(row, textvariable=self.family, values=['Arial', 'Times New Roman', 'Courier New'],
                             state='readonly', width=16)
        combo.pack(side='left')
        combo.bind('<<ComboboxSelected>>', lambda e: self.format_selection(family=self.family.get()))
        self.size = tk.StringVar(value=str(self.default['size']))
        spin = ttk.Spinbox(row, from_=4, to=200, textvariable=self.size, width=5,
                           command=self.set_size)
        spin.pack(side='left', padx=2)
        spin.bind('<Return>', lambda e: self.set_size())
        editor_button(row, text='Set size', command=self.set_size, takefocus=False).pack(side='left')
        row = ttk.Frame(self.toolbar)
        row.pack(fill='x', pady=2)
        for label, key in [('B', 'bold'), ('I', 'italic'), ('U', 'underline')]:
            editor_button(row, text=label, width=3, command=lambda k=key: self.toggle(k), takefocus=False).pack(side='left', padx=2)
        editor_button(row, text='Text colour', command=self.choose_text, takefocus=False).pack(side='left')
        row = ttk.Frame(self.toolbar)
        row.pack(fill='x')
        for label, action in [('Fill', lambda: self.choose_box('fill')),
                              ('No fill', lambda: self.set_box(fill=None)),
                              ('Outline', lambda: self.choose_box('border')),
                              ('No outline', lambda: self.set_box(border=None))]:
            editor_button(row, text=label, command=action, takefocus=False).pack(side='left', padx=1)
        self.align = tk.StringVar(value=box['align'])
        align = ttk.Combobox(row, textvariable=self.align, values=['left', 'center', 'right'], state='readonly', width=7)
        align.pack(side='left', padx=4)
        align.bind('<<ComboboxSelected>>', lambda e: self.set_box(align=self.align.get()))
        ttk.Label(self.toolbar, text='Select text to format it. No selection: format the whole box.', wraplength=400).pack(anchor='w', pady=2)
        self.toolbar_id = app.canvas.create_window(0, 0, window=self.toolbar, anchor='nw', tags='inline')
        self.edges = [app.canvas.create_rectangle(0, 0, 0, 0, fill='#8061e5', outline='', tags='inline') for _ in range(4)]
        self.handle = app.canvas.create_rectangle(0, 0, 0, 0, fill='#8061e5', outline='white', tags='inline')
        self.interactive_items = set(self.edges + [self.handle])
        for item in self.interactive_items:
            app.canvas.tag_bind(item, '<ButtonRelease-1>', self.flush_position)
        for edge in self.edges:
            app.canvas.tag_bind(edge, '<ButtonPress-1>', self.start_move)
            app.canvas.tag_bind(edge, '<B1-Motion>', self.move)
            app.canvas.tag_bind(edge, '<Enter>', lambda e: app.canvas.configure(cursor='fleur'))
            app.canvas.tag_bind(edge, '<Leave>', lambda e: app.canvas.configure(cursor=''))
        app.canvas.tag_bind(self.handle, '<ButtonPress-1>', self.start_resize)
        app.canvas.tag_bind(self.handle, '<B1-Motion>', self.resize)
        self.widget.bind('<Control-Return>', lambda e: self.key_commit())
        self.widget.bind('<Control-s>', lambda e: self.key_commit())
        self.widget.bind('<Escape>', lambda e: self.key_cancel())
        self.widget.bind('<Control-z>', lambda e: self.local_undo())
        self.widget.bind('<Control-y>', lambda e: self.local_redo())
        self.widget.bind('<Control-b>', lambda e: self.toggle('bold'))
        self.widget.bind('<Control-i>', lambda e: self.toggle('italic'))
        self.widget.bind('<Control-u>', lambda e: self.toggle('underline'))
        self.widget.bind('<Control-f>', app.find_shortcut)
        self.widget.bind('<Control-h>', lambda e: 'break')
        self.widget.bind('<Control-MouseWheel>', app.wheel)
        # Save a full attributed snapshot before native Text processes edits;
        # Tk's built-in undo does not restore formatting tags.
        self.widget.bind('<KeyPress>', self.before_key, add='+')
        self.widget.bind('<<Paste>>', lambda e: self.checkpoint(), add='+')
        self.widget.bind('<<Cut>>', lambda e: self.checkpoint(), add='+')
        self.widget.bind('<<Modified>>', self.modified)
        self.caret = TextCaret(self.widget, self.caret_font)
        self.widget.edit_modified(False)
        self.toolbar_layout = ResponsiveToolbar(self)
        self.toolbar.update_idletasks()  # once, not for every pointer event
        self.toolbar_size = (self.toolbar.winfo_reqwidth(), self.toolbar.winfo_reqheight())
        self.position()
        self.widget.focus_set()
        self.widget.mark_set('insert', 'end-1c')
        self.caret.schedule()
        self.schedule_fit()
        app.status.set('Type live. Select letters to format; drag the blue border to move. Ctrl+Enter applies, Escape cancels.')

    def make_font(self, style):
        key = tuple(style[k] for k in ('family', 'size', 'bold', 'italic', 'underline'))
        if key in self.font_cache:
            return self.font_cache[key]
        font = tkfont.Font(root=self.app, family=style['family'], size=-max(4, round(style['size'] * self.app.zoom)),
                           weight='bold' if style['bold'] else 'normal', slant='italic' if style['italic'] else 'roman',
                           underline=style['underline'])
        self.fonts.append(font)
        self.font_cache[key] = font
        return font

    def caret_font(self):
        index = self.widget.index('insert')
        if self.widget.compare(index, '>=', 'end-1c') and self.widget.compare(index, '>', '1.0'):
            index = self.widget.index(index + '-1c')
        style = self.style_at(index)
        self.insertion_style = deepcopy(style)
        font = self.make_font(style)
        # The base font controls empty-line spacing. Keeping a previous 18pt
        # default after selecting 5pt was creating huge blank lines and carets.
        if str(self.widget.cget('font')) != str(font):
            self.widget.configure(font=font, foreground=style['color'])
        if not self.widget.tag_ranges('sel'):
            self.family.set(style['family'])
            self.size.set(f'{style["size"]:g}')
        return font, style['color']

    def repair_unstyled_text(self):
        active, unstyled = set(), []
        for kind, value, index in self.widget.dump('1.0', 'end-1c', text=True, tag=True):
            if kind == 'tagon' and value in self.styles:
                active.add(value)
            elif kind == 'tagoff':
                active.discard(value)
            elif kind == 'text' and not active:
                unstyled.append((index, f'{index}+{len(value)}c'))
        if unstyled:
            tag = self.style_tag(self.insertion_style)
            for start, end in unstyled:
                self.widget.tag_add(tag, start, end)

    def schedule_fit(self):
        if self.pending_fit is not None:
            self.app.after_cancel(self.pending_fit)
        self.pending_fit = self.app.after(75, self.fit_live)

    def fit_live(self, strict=False):
        if self.pending_fit is not None:
            self.app.after_cancel(self.pending_fit)
            self.pending_fit = None
        if self.closed:
            return
        try:
            fitted, _ = fit_box(self.value(), self.bounds)
            rect = fitz.Rect(fitted['rect'])
            if rect != self.rect:
                self.rect = rect
                self.request_position()
            self.caret.schedule()
        except ValueError as exc:
            if strict:
                raise
            self.app.status.set(str(exc))

    def style_tag(self, style):
        style = dict(DEFAULT_STYLE, **style)
        for name, value in self.styles.items():
            if value == style:
                return name
        name = f'style{len(self.styles)}'
        self.styles[name] = deepcopy(style)
        self.widget.tag_configure(name, font=self.make_font(style), foreground=style['color'])
        return name

    def style_at(self, index):
        result = self.default
        for tag in self.widget.tag_names(index):
            if tag in self.styles:
                result = self.styles[tag]
        return deepcopy(result)

    def value(self):
        result = deepcopy(self.box)
        result['rect'], result['runs'], result['default'] = list(self.rect), [], deepcopy(self.default)
        active = set()
        priority = {tag: n for n, tag in enumerate(self.widget.tag_names())}
        for kind, value, index in self.widget.dump('1.0', 'end-1c', text=True, tag=True):
            if kind == 'tagon':
                active.add(value)
                continue
            if kind == 'tagoff':
                active.discard(value)
                continue
            if kind != 'text':
                continue
            tags = [t for t in active if t in self.styles]
            style = deepcopy(self.styles[max(tags, key=lambda t: priority[t])] if tags else self.default)
            if result['runs'] and result['runs'][-1]['style'] == style:
                result['runs'][-1]['text'] += value
            else:
                result['runs'].append(dict(text=value, style=style))
        return result

    def checkpoint(self, typing=False):
        now = time.monotonic()
        if typing and now - self.last_typing_checkpoint < .35:
            return
        self.last_typing_checkpoint = now if typing else 0
        value = self.value()
        if not self.local_history or self.local_history[-1] != value:
            self.local_history.append(value)
            self.local_history = self.local_history[-100:]
        self.local_future.clear()

    def before_key(self, event):
        if not event.state & 4 and (event.char or event.keysym in ('BackSpace', 'Delete', 'Return', 'Tab')):
            self.checkpoint(typing=True)

    def restore(self, box):
        self.box = deepcopy(box)
        self.rect = fitz.Rect(box['rect'])
        self.default = deepcopy(box['default'])
        self.widget.delete('1.0', 'end')
        for run in box['runs']:
            self.widget.insert('end', run['text'], (self.style_tag(run['style']), 'alignment'))
        self.family.set(self.default['family'])
        self.size.set(str(self.default['size']))
        self.align.set(box['align'])
        self.position()
        self.caret.schedule()
        self.schedule_fit()

    def local_undo(self):
        self.last_typing_checkpoint = 0
        if self.local_history:
            self.local_future.append(self.value())
            self.restore(self.local_history.pop())
        return 'break'

    def local_redo(self):
        self.last_typing_checkpoint = 0
        if self.local_future:
            self.local_history.append(self.value())
            self.restore(self.local_future.pop())
        return 'break'

    def format_selection(self, **change):
        self.checkpoint()
        selection = self.widget.tag_ranges('sel')
        start, end = selection if selection else ('1.0', 'end-1c')
        start, end = self.widget.index(start), self.widget.index(end)
        # dump(text=True) alone need not split at tag transitions. Include tag
        # events to obtain precisely the attributed text runs in one Tk call.
        segments = [(index, self.widget.index(f'{index}+{len(value)}c'), dict(self.style_at(index), **change))
                    for kind, value, index in self.widget.dump(start, end, text=True, tag=True) if kind == 'text']
        for tag in self.styles:
            self.widget.tag_remove(tag, start, end)
        for begin, finish, style in segments:
            self.widget.tag_add(self.style_tag(style), begin, finish)
        if not selection:
            self.default.update(change)
            self.insertion_style = deepcopy(self.default)
            self.widget.configure(font=self.make_font(self.default), foreground=self.default['color'])
        self.widget.focus_set()
        self.caret.schedule()
        self.schedule_fit()
        return 'break'

    def toggle(self, key):
        ranges = self.widget.tag_ranges('sel')
        index = ranges[0] if ranges else '1.0'
        return self.format_selection(**{key: not self.style_at(index)[key]})

    def set_size(self):
        try:
            size = float(self.size.get())
            if not 4 <= size <= 200:
                raise ValueError()
        except ValueError:
            self.app.status.set('Choose a font size from 4 to 200 points.')
            return 'break'
        return self.format_selection(size=size)

    def choose_text(self):
        color = colorchooser.askcolor(parent=self.app, title='Selected text colour', color=self.default['color'])[1]
        if color:
            self.format_selection(color=color)

    def choose_box(self, key):
        color = colorchooser.askcolor(parent=self.app, title='Box ' + key, color=self.box.get(key) or '#ffffff')[1]
        if color:
            self.set_box(**{key: color})

    def set_box(self, **values):
        self.checkpoint()
        self.box.update(values)
        self.position()
        self.widget.focus_set()

    def position(self):
        c, z = self.app.canvas, self.app.zoom
        x0, y0, x1, y1 = [v * z + 20 for v in self.rect]
        c.coords(self.window, x0, y0)
        size = (max(12, x1 - x0), max(12, y1 - y0))
        if size != self.last_size:
            c.itemconfigure(self.window, width=size[0], height=size[1])
            self.widget.configure(padx=max(1, round(4 * z)), pady=max(1, round(4 * z)))
            self.last_size = size
        # Tk Text has no alpha background. Sample the page beneath an unfilled
        # box for its live editor; the committed PDF remains truly transparent.
        sample_x = max(0, min(self.app.photo.width() - 1, round(self.rect.x0 * z)))
        sample_y = max(0, min(self.app.photo.height() - 1, round(self.rect.y0 * z)))
        color = self.backdrop.getpixel((sample_x, sample_y))
        background = self.box['fill'] or ('#%02x%02x%02x' % color)
        if self.widget.cget('background') != background:
            self.widget.configure(background=background)
        if self.last_align != self.box['align']:
            self.widget.tag_configure('alignment', justify=self.box['align'])
            self.widget.tag_add('alignment', '1.0', 'end')
            self.last_align = self.box['align']
        coords = [(x0 - 3, y0 - 3, x1 + 3, y0), (x0 - 3, y1, x1 + 3, y1 + 3),
                  (x0 - 3, y0, x0, y1), (x1, y0, x1 + 3, y1)]
        for item, values in zip(self.edges, coords):
            c.coords(item, *values)
            c.tag_raise(item)
        c.coords(self.handle, x1 - 5, y1 - 5, x1 + 6, y1 + 6)
        c.tag_raise(self.handle)
        left = c.canvasx(0)
        tw, th = self.toolbar_size
        tx = max(left, min(x0, left + c.winfo_width() - tw - 8))
        ty = max(c.canvasy(0), y0 - th - 12)
        # At the top of a page put the toolbar below, leaving text accessible.
        if ty + th > y0 - 3:
            ty = y1 + 14
        ty = visible_toolbar_y(c, ty, th)
        c.coords(self.toolbar_id, tx, ty)
        c.tag_raise(self.toolbar_id)

    def request_position(self):
        if self.pending_position is None:
            self.pending_position = self.app.after(16, self.flush_position)

    def flush_position(self, event=None):
        if self.pending_position is not None:
            self.app.after_cancel(self.pending_position)
            self.pending_position = None
        if not self.closed:
            self.position()
        return 'break'

    def start_move(self, event):
        if self.pending_fit is not None:
            self.app.after_cancel(self.pending_fit)
            self.pending_fit = None
        self.checkpoint()
        self.drag = (self.app.canvas.canvasx(event.x), self.app.canvas.canvasy(event.y), fitz.Rect(self.rect))
        return 'break'

    def move(self, event):
        if not self.drag:
            return 'break'
        x, y, original = self.drag
        bounds = self.bounds
        dx = max(-original.x0, min(bounds.width - original.x1, (self.app.canvas.canvasx(event.x) - x) / self.app.zoom))
        dy = max(-original.y0, min(bounds.height - original.y1, (self.app.canvas.canvasy(event.y) - y) / self.app.zoom))
        self.rect = original + (dx, dy, dx, dy)
        self.request_position()
        return 'break'

    def start_resize(self, event):
        self.checkpoint()
        self.schedule_fit()
        return 'break'

    def resize(self, event):
        c, z = self.app.canvas, self.app.zoom
        bounds = self.bounds
        self.rect.x1 = max(self.rect.x0 + 24, min(bounds.width, (c.canvasx(event.x) - 20) / z))
        self.rect.y1 = max(self.rect.y0 + 24, min(bounds.height, (c.canvasy(event.y) - 20) / z))
        self.request_position()
        self.schedule_fit()
        return 'break'

    def modified(self, event=None):
        if not self.closed and self.widget.edit_modified():
            self.widget.edit_modified(False)
            self.repair_unstyled_text()
            self.widget.tag_add('alignment', '1.0', 'end')
            self.app.status.set('Text updates live. Select letters to format them. Drag the blue border to move the box.')
            self.schedule_fit()
            self.caret.schedule()

    def commit(self):
        if self.closed:
            return
        self.repair_unstyled_text()
        self.fit_live(strict=True)
        box = self.value()
        if box == self.original and 'xref' in self.original:
            self.close()
            self.app.render()
            return
        before = self.app.pdf.bytes()
        try:
            put_box(self.app.pdf.doc, self.index, box)
        except Exception:
            self.app.pdf.restore(before)
            raise
        self.app.history.append(before)
        self.app.history = self.app.history[-8:]
        self.app.redo_history.clear()
        self.app.dirty = True
        self.close()
        self.app.refresh(dirty_pages={self.index})
        self.app.status.set('Text box saved. Click it in Edit text boxes to move, resize or format it again.')

    def remove(self):
        identifier = self.box['id']
        self.close()
        self.app.change(lambda: delete_box(self.app.pdf.doc, self.index, identifier), 'Text box deleted. Undo restores it.', dirty_pages={self.index})

    def close(self):
        self.closed = True
        self.caret.close()
        if self.pending_fit is not None:
            self.app.after_cancel(self.pending_fit)
            self.pending_fit = None
        if self.pending_position is not None:
            self.app.after_cancel(self.pending_position)
            self.pending_position = None
        self.app.canvas.delete('inline')
        self.app.canvas.configure(cursor='')
        self.widget.destroy()
        self.toolbar.destroy()
        self.app.inline = None

    def cancel(self):
        self.close()
        self.app.render()

    def key_commit(self):
        self.app.guard(self.commit)
        return 'break'

    def key_cancel(self):
        self.cancel()
        return 'break'

