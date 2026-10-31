"""Text watermarks positioned in the visible (cropped and rotated) page."""
import math
import fitz


def add_watermarks(doc, text, *, layout='top-left', angle=0, opacity=.5,
                   fontsize=16, color=(.65, .65, .65), pages=None):
    text = text.strip()
    if not text or '\n' in text or '\r' in text:
        raise ValueError('Enter a single line of watermark text.')
    if layout not in ('top-left', 'center', 'full-page', 'tiled'):
        raise ValueError('Choose a valid watermark layout.')
    angle, opacity, fontsize = float(angle), float(opacity), float(fontsize)
    if not math.isfinite(angle) or not -180 <= angle <= 180:
        raise ValueError('Choose an angle between -180 and 180 degrees.')
    if not math.isfinite(opacity) or not 0 < opacity <= 1:
        raise ValueError('Choose opacity above 0 and up to 100%.')
    if not math.isfinite(fontsize) or not 1 <= fontsize <= 300:
        raise ValueError('Choose a font size between 1 and 300 points.')
    if len(color) != 3 or any(not math.isfinite(c) or not 0 <= c <= 1 for c in color):
        raise ValueError('Choose a valid watermark colour.')
    indices = list(range(len(doc))) if pages is None else list(dict.fromkeys(pages))
    if any(not isinstance(i, int) or not 0 <= i < len(doc) for i in indices):
        raise ValueError('Watermark page is outside the document.')
    # The existing default uses Helvetica. Reject unsupported characters instead
    # of silently saving question marks in an otherwise successful watermark.
    if any(ord(c) > 255 or ord(c) < 32 for c in text):
        raise ValueError('Watermark text currently supports Latin-1 characters only.')
    font = fitz.Font('helv')
    width = font.text_length(text, fontsize=1)
    height = font.ascender - font.descender
    radians = math.radians(angle)
    rotated_w = abs(math.cos(radians)) * width + abs(math.sin(radians)) * height
    rotated_h = abs(math.sin(radians)) * width + abs(math.cos(radians)) * height
    for index in indices:
        page = doc[index]
        bounds = page.rect
        columns, rows = (3, 4) if layout == 'tiled' else (1, 1)
        cell_w, cell_h = bounds.width / columns, bounds.height / rows
        margin = min(36, cell_w * .1, cell_h * .1)
        fit_size = min((cell_w - 2 * margin) / rotated_w, (cell_h - 2 * margin) / rotated_h)
        size = fit_size if layout == 'full-page' else min(fontsize, fit_size)
        for row in range(rows):
            for column in range(columns):
                if layout == 'top-left':
                    center = fitz.Point(margin + rotated_w * size / 2, margin + rotated_h * size / 2)
                else:
                    center = fitz.Point((column + .5) * cell_w, (row + .5) * cell_h)
                center *= page.derotation_matrix
                origin = center + fitz.Point(-width * size / 2, (font.ascender + font.descender) * size / 2)
                page.insert_text(origin, text, fontsize=size, fontname='helv', color=color,
                                 fill_opacity=opacity, morph=(center, fitz.Matrix(angle + page.rotation)), overlay=True)
