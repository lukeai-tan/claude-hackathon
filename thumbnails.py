"""Scrollable page previews, rendered in small idle batches."""
import io
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import fitz


class Thumbnails(ttk.Frame):
    def __init__(self, parent, on_select, on_reorder):
        super().__init__(parent)
        ttk.Style(self).configure('Pages.Treeview', rowheight=154)
        self.tree = ttk.Treeview(self, show='tree', selectmode='browse', style='Pages.Treeview')
        self.tree.column('#0', width=170, stretch=True)
        scroll = ttk.Scrollbar(self, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
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
        self.images = {}
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
        self.tree.selection_set(str(index))
        self.tree.see(str(index))

    def refresh(self, pdf, selected):
        self.cancel_drag()
        self.generation += 1
        generation = self.generation
        if self.pending:
            self.after_cancel(self.pending)
            self.pending = None
        self.tree.delete(*self.tree.get_children())
        self.images.clear()
        for i in range(len(pdf.doc)):
            self.tree.insert('', 'end', iid=str(i), text=f'  {i + 1}')
        self.select(selected)
        order = [selected] + [i for i in range(len(pdf.doc)) if i != selected]
        def render_next():
            self.pending = None
            if generation != self.generation or not order:
                return
            i = order.pop(0)
            if pdf.doc.is_closed:
                return
            page = pdf.doc[i]
            scale = min(105 / page.rect.width, 140 / page.rect.height)
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            photo = ImageTk.PhotoImage(Image.open(io.BytesIO(pix.tobytes('png'))))
            self.images[i] = photo
            self.tree.item(str(i), image=photo)
            if order:
                self.pending = self.after(10, render_next)
        render_next()
