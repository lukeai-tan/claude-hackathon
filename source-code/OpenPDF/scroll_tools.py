"""Pixel scrolling for Tk 8.6, without viewport-sized canvas 'units'."""
import sys


def wheel_setting(horizontal=False):
    """Read the user's Windows wheel preference, including disabled/page scroll."""
    if sys.platform == 'win32':
        import ctypes
        value = ctypes.c_uint()
        action = 0x006C if horizontal else 0x0068  # GETWHEELSCROLLCHARS / LINES
        if ctypes.windll.user32.SystemParametersInfoW(action, 0, ctypes.byref(value), 0):
            return value.value
    return 3


class CanvasScroll:
    def __init__(self, canvas):
        self.canvas = canvas
        self.remainder = {'x': 0.0, 'y': 0.0}
        self.system = canvas.tk.call('tk', 'windowingsystem')
        canvas.configure(xscrollincrement=1, yscrollincrement=1)

    def wheel(self, event):
        number = getattr(event, 'num', None)
        axis = 'x' if event.state & 0x1 or number in (6, 7) else 'y'
        if number in (4, 5, 6, 7):
            delta = 120 if number in (4, 6) else -120
        else:
            delta = getattr(event, 'delta', 0)
        if not delta:
            return
        if self.system == 'aqua':
            pixels = -delta  # Tk/macOS already supplies small trackpad deltas.
        else:
            count = wheel_setting(axis == 'x')
            if count == 0xFFFFFFFF:
                distance = self.canvas.winfo_width() if axis == 'x' else self.canvas.winfo_height()
            else:
                # Chromium's Windows convention: 100/3 logical pixels per line.
                distance = count * (100 / 3) * self.canvas.winfo_fpixels('1i') / 96
            pixels = -delta / 120 * distance
        total = pixels + self.remainder[axis]
        whole = int(total)
        self.remainder[axis] = total - whole
        if whole:
            view = self.canvas.xview_scroll if axis == 'x' else self.canvas.yview_scroll
            view(whole, 'units')
