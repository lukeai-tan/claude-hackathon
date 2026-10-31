"""Screen UI typography and a caret sized to the active text run."""
import sys
import hashlib
import io
from functools import lru_cache
import tkinter as tk
from tkinter import font as tkfont


@lru_cache(maxsize=16)
def isolated_screen_font(data):
    """Never register a PDF subset under a system UI font's family name."""
    from fontTools.ttLib import TTFont
    family = 'OpenPDF_' + hashlib.sha256(data).hexdigest()[:16]
    font = TTFont(io.BytesIO(data))
    names = font['name']
    for record in list(names.names):
        if record.nameID in (1, 3, 4, 6, 16, 18, 21):
            names.setName(family, record.nameID, record.platformID, record.platEncID, record.langID)
    output = io.BytesIO()
    font.save(output)
    font.close()
    return family, output.getvalue()


def enable_dpi_awareness():
    if sys.platform != 'win32':
        return
    import ctypes
    try:
        # System-aware avoids Windows bitmap-stretching Tk's controls. Unlike
        # per-monitor v2 it also works consistently with the bundled Tk 8.6.
        if ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-2)):
            return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass


def configure_ui_fonts(root, style):
    family = 'Segoe UI' if sys.platform == 'win32' else 'DejaVu Sans'
    for name in ('TkDefaultFont', 'TkTextFont', 'TkMenuFont', 'TkHeadingFont', 'TkCaptionFont', 'TkSmallCaptionFont'):
        try:
            tkfont.nametofont(name, root=root).configure(family=family, size=10, weight='normal', slant='roman')
        except tk.TclError:
            pass
    for name in ('TButton', 'TLabel', 'TEntry', 'TCombobox', 'TSpinbox', 'TRadiobutton', 'TNotebook.Tab', 'Treeview'):
        style.configure(name, font='TkDefaultFont')
    style.configure('Editor.TButton', font='TkDefaultFont', padding=(7, 4))
    root.option_add('*TCombobox*Listbox.font', 'TkDefaultFont')


class TextCaret:
    """Tk's native caret uses the entire display-line height for mixed fonts.

    This tiny overlay follows the current run's ascent/descent instead. No PDF
    rendering or document mutation is involved; refresh is coalesced at idle.
    """
    def __init__(self, widget, font_provider):
        self.widget, self.font_provider = widget, font_provider
        self.closed = False
        self.pending = self.timer = None
        self.geometry = None
        self.visible = False
        widget.configure(insertontime=0, insertwidth=1, insertborderwidth=0)
        self.marker = tk.Frame(widget, borderwidth=0, highlightthickness=0, takefocus=False)
        for event in ('<KeyRelease>', '<ButtonRelease-1>', '<FocusIn>', '<Configure>', '<MouseWheel>'):
            widget.bind(event, self.schedule, add='+')
        widget.bind('<FocusOut>', self.hide, add='+')

    def schedule(self, event=None):
        if not self.closed and self.pending is None:
            self.pending = self.widget.after_idle(self.refresh)

    def refresh(self):
        self.pending = None
        if self.closed:
            return
        if self.widget.focus_get() is not self.widget:
            self.hide()
            return
        font, color = self.font_provider()
        box = self.widget.bbox('insert')
        line = self.widget.dlineinfo('insert')
        if not box or not line:
            self.hide()
            return
        y = round(line[1] + line[4] - font.metrics('ascent'))
        height = font.metrics('ascent') + font.metrics('descent')
        top = max(0, y)
        height = max(1, min(y + height, self.widget.winfo_height()) - top)
        self.geometry = dict(x=box[0], y=top, width=1, height=height)
        self.marker.configure(background=color)
        self.marker.place(**self.geometry)
        self.marker.lift()
        self.visible = True
        if self.timer is not None:
            self.widget.after_cancel(self.timer)
        self.timer = self.widget.after(500, self.blink)

    def blink(self):
        self.timer = None
        if self.closed or self.widget.focus_get() is not self.widget or not self.geometry:
            return
        if self.visible:
            self.marker.place_forget()
        else:
            self.marker.place(**self.geometry)
        self.visible = not self.visible
        self.timer = self.widget.after(500, self.blink)

    def hide(self, event=None):
        if self.closed:
            return
        self.marker.place_forget()
        self.visible = False
        if self.timer is not None:
            self.widget.after_cancel(self.timer)
            self.timer = None

    def close(self):
        if self.closed:
            return
        self.hide()
        self.closed = True
        if self.pending is not None:
            self.widget.after_cancel(self.pending)
            self.pending = None
        self.marker.destroy()

