"""Freehand ink saved as standard, printable PDF ink annotations."""
import math
import fitz


def add_stroke(page, points, color='#1761c5', width=2.5):
    width = float(width)
    if not math.isfinite(width) or not .5 <= width <= 20:
        raise ValueError('Choose a pen thickness between 0.5 and 20 points.')
    if len(color) != 7 or not color.startswith('#'):
        raise ValueError('Choose a valid ink colour.')
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
    vertices = []
    for point in points:
        x, y = map(float, point)
        if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x <= bounds.width and 0 <= y <= bounds.height):
            raise ValueError('Keep the pen stroke inside the page.')
        if not vertices or vertices[-1] != (x, y):
            vertices.append((x, y))
    if not vertices:
        return None
    if len(vertices) == 1:
        x, y = vertices[0]
        vertices.append((x + .01 if x + .01 <= bounds.width else x - .01, y))
    annot = page.add_ink_annot([vertices])
    annot.set_colors(stroke=rgb)
    annot.set_border(width=width)
    annot.set_flags(fitz.PDF_ANNOT_IS_PRINT)
    annot.set_info(title='OpenPDF Studio', subject='Freehand pen')
    annot.update()
    return annot.xref
