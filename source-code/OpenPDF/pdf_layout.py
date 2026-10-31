"""Keep PDF editing controls inside the narrower OpenSuite document viewport."""
class ResponsiveToolbar:
    def __init__(self, editor):
        self.editor = editor
        self.canvas = editor.app.canvas
        self.toolbar = editor.toolbar
        self.width = None
        self.pending = None
        self.rows = [w for w in self.toolbar.winfo_children() if w.winfo_class() == 'TFrame']
        self.groups = [row.winfo_children() for row in self.rows] if self.rows else [self.toolbar.winfo_children()]
        self.resize_binding = self.canvas.bind('<Configure>', self.schedule, add='+')
        self.toolbar.bind('<Configure>', self.measured, add='+')
        self.toolbar.bind('<Destroy>', self.destroyed, add='+')
        self.layout()

    def schedule(self, event=None):
        if self.pending is None:
            self.pending = self.canvas.after_idle(self.layout)

    def layout(self):
        self.pending = None
        available = max(200, self.canvas.winfo_width() - 16)
        natural = max(sum(w.winfo_reqwidth() + 4 for w in group) for group in self.groups) + 8
        width = min(available, natural)
        if width == self.width:
            return
        self.width = width
        self.canvas.itemconfigure(self.editor.toolbar_id, width=width)
        for widget in self.toolbar.winfo_children():
            if widget.winfo_class() == 'TLabel':
                widget.configure(wraplength=width - 12)
        for group in self.groups:
            used, y, row_height = 0, 2, 0
            for widget in group:
                if widget.winfo_class() == 'TLabel':
                    widget.configure(wraplength=width - 16)
                needed = widget.winfo_reqwidth() + 4
                if used and used + needed > width - 8:
                    y += row_height + 4
                    used, row_height = 0, 0
                if widget.winfo_manager() == 'pack':
                    widget.pack_forget()
                widget.place(x=used + 2, y=y, width=widget.winfo_reqwidth(), height=widget.winfo_reqheight())
                used += needed
                row_height = max(row_height, widget.winfo_reqheight())
            parent = group[0].master
            parent.configure(height=y + row_height + 4)
            parent.pack_propagate(False)

    def measured(self, event):
        if event.widget is self.toolbar:
            self.editor.toolbar_size = (event.width, event.height)
            self.editor.request_position()

    def destroyed(self, event):
        if event.widget is self.toolbar:
            self.canvas.unbind('<Configure>', self.resize_binding)
            if self.pending is not None:
                self.canvas.after_cancel(self.pending)
                self.pending = None


def visible_toolbar_y(canvas, proposed_y, height):
    top = canvas.canvasy(0)
    return max(top, min(proposed_y, top + canvas.winfo_height() - height - 8))
