"""Scrollable page previews, rendered in small idle batches."""
import math
from collections import OrderedDict
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import fitz
from render_tools import pixmap_image


class Thumbnails(ttk.Frame):
    def __init__(self, parent, on_select, on_reorder, is_interacting=lambda: False):
        super().__init__(parent)
        ttk.Style(self).configure('Pages.Treeview', rowheight=154)
        self.tree = ttk.Treeview(self, show='tree', selectmode='browse', style='Pages.Treeview')
        self.tree.column('#0', width=170, stretch=True)
        scroll = ttk.Scrollbar(self, orient='vertical', command=self.tree.yview)
        self.scroll = scroll
        self.tree.configure(yscrollcommand=self.on_scroll)
        scroll.pack(side='right', fill='y')
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', on_select)
        self.on_reorder = on_reorder
        self.drag_source = None
        self.drop_index = None
        self.dragging = False
        self.marker = tk.Frame(self.tree, background='#2563eb', height=3)
        self.tree.bind('<ButtonPress-1>', self.press)
        self.tree.bind('<B1-Motion>', self.motion)
        self.tree.bind('<ButtonRelease-1>', self.release)
        self.tree.bind('<Escape>', self.cancel_drag)
        self.scroll_pending = None
        self.images = OrderedDict()
        self.stale = set()
        self.pdf = None
        self.owner = None
        self.render_queue = []
        self.is_interacting = is_interacting
        self.pending = None
        self.generation = 0

    def press(self, event):
        self.cancel_drag()
        item = self.tree.identify_row(event.y)
        self.drag_source = int(item) if item else None
        self.press_y = event.y

    def motion(self, event):
        if self.drag_source is None:
            return
        if not self.dragging and abs(event.y - self.press_y) < 6:
            return
        self.dragging = True
        self.tree.configure(cursor='fleur')
        self.drag_y = event.y
        self.show_drop(event.y)
        if self.scroll_pending is None:
            self.scroll_pending = self.after(120, self.auto_scroll)
        return 'break'

    def show_drop(self, y):
        item = self.tree.identify_row(max(1, min(y, self.tree.winfo_height() - 2)))
        if not item:
            items = self.tree.get_children()
            if not items:
                return
            item = items[-1] if y > 0 else items[0]
        bbox = self.tree.bbox(item)
        if not bbox:
            return
        _, top, _, height = bbox
        after = y >= top + height / 2
        slot = int(item) + int(after)
        self.drop_index = slot - int(slot > self.drag_source)
        self.marker.place(x=0, y=top + (height if after else 0) - 1,
                          width=self.tree.winfo_width(), height=3)

    def auto_scroll(self):
        self.scroll_pending = None
        if not self.dragging:
            return
        if self.drag_y < 25:
            self.tree.yview_scroll(-1, 'units')
        elif self.drag_y > self.tree.winfo_height() - 25:
            self.tree.yview_scroll(1, 'units')
        self.show_drop(self.drag_y)
        self.scroll_pending = self.after(120, self.auto_scroll)

    def release(self, event):
        source, target, dragging = self.drag_source, self.drop_index, self.dragging
        self.cancel_drag()
        if dragging:
            if target is not None and source != target:
                self.on_reorder(source, target)
            return 'break'

    def cancel_drag(self, event=None):
        self.marker.place_forget()
        self.tree.configure(cursor='')
        if self.scroll_pending:
            self.after_cancel(self.scroll_pending)
        self.scroll_pending = None
        self.drag_source = self.drop_index = None
        self.dragging = False

    def selected(self):
        selection = self.tree.selection()
        return int(selection[0]) if selection else None

    def select(self, index):
        if self.tree.selection() != (str(index),):
            self.tree.selection_set(str(index))
        self.tree.see(str(index))
        self.queue_visible()

    def refresh(self, pdf, selected, dirty_pages=None):
        self.cancel_drag()
        self.generation += 1
        generation = self.generation
        if self.pending:
            self.after_cancel(self.pending)
            self.pending = None
        reset = self.owner is not pdf.doc or len(self.tree.get_children()) != len(pdf.doc)
        self.pdf, self.owner = pdf, pdf.doc
        self.render_queue = []
        if reset:
            self.tree.delete(*self.tree.get_children())
            self.images.clear()
            self.stale.clear()
            for i in range(len(pdf.doc)):
                self.tree.insert('', 'end', iid=str(i), text=f'  {i + 1}')
        self.stale.update(range(len(pdf.doc)) if dirty_pages is None else dirty_pages)
        self.select(selected)

    def on_scroll(self, first, last):
        self.scroll.set(first, last)
        self.queue_visible()

    def queue_visible(self):
        if not self.pdf or self.pdf.doc.is_closed:
            return
        count = len(self.pdf.doc)
        start = max(0, int(float(self.tree.yview()[0]) * count) - 1)
        visible = range(start, min(count, start + math.ceil(self.tree.winfo_height() / 154) + 3))
        selected = self.selected()
        order = ([selected] if selected is not None else []) + list(visible)
        # Only visible previews, not every page in a long document.
        self.render_queue = list(dict.fromkeys(i for i in order if i not in self.images or i in self.stale))
        if self.render_queue and self.pending is None:
            self.pending = self.after_idle(self.render_next)

    def render_next(self):
        self.pending = None
        if not self.render_queue or not self.pdf or self.pdf.doc.is_closed:
            return
        if self.is_interacting() or self.dragging:
            self.pending = self.after(100, self.render_next)
            return
        i = self.render_queue.pop(0)
        page = self.pdf.doc[i]
        scale = min(105 / page.rect.width, 140 / page.rect.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        photo = ImageTk.PhotoImage(pixmap_image(pix))
        self.images[i] = photo
        self.images.move_to_end(i)
        self.stale.discard(i)
        self.tree.item(str(i), image=photo)
        while len(self.images) > 64:
            old, _ = self.images.popitem(last=False)
            self.tree.item(str(old), image='')
        if self.render_queue:
            self.pending = self.after(16, self.render_next)
