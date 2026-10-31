"""Scrollable page previews, rendered in small idle batches."""
import io
from tkinter import ttk
from PIL import Image, ImageTk
import fitz


class Thumbnails(ttk.Frame):
    def __init__(self, parent, on_select):
        super().__init__(parent)
        ttk.Style(self).configure('Pages.Treeview', rowheight=154)
        self.tree = ttk.Treeview(self, show='tree', selectmode='browse', style='Pages.Treeview')
        self.tree.column('#0', width=170, stretch=True)
        scroll = ttk.Scrollbar(self, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', on_select)
        self.images = {}
        self.pending = None
        self.generation = 0

    def selected(self):
        selection = self.tree.selection()
        return int(selection[0]) if selection else None

    def select(self, index):
        self.tree.selection_set(str(index))
        self.tree.see(str(index))

    def refresh(self, pdf, selected):
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
