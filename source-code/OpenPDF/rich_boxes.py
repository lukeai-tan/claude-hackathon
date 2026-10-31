"""Editable added boxes stored as ordinary PDF text, with per-stream metadata.

Keeping metadata on its drawing stream lets PDF garbage collection renumber
objects safely. Rewrites such as redaction discard that stream and its editor
metadata together, so a later edit cannot resurrect removed text.
"""
from contextlib import contextmanager
from copy import deepcopy
from functools import lru_cache
import json
import uuid
import fitz

KEY = 'OpenPDFStudioBox'
DEFAULT_STYLE = dict(family='Arial', size=18, color='#000000', bold=False,
                     italic=False, underline=False)


def new_box(rect):
    return dict(id=uuid.uuid4().hex, rect=list(rect), runs=[], fill=None,
                border=None, align='left', default=deepcopy(DEFAULT_STYLE))


def boxes(page):
    result = []
    for xref in page.get_contents():
        kind, value = page.parent.xref_get_key(xref, KEY)
        if kind != 'string':
            continue
        try:
            data = json.loads(value)
            if data.get('version') != 1 or not data.get('id'):
                continue
            data['xref'] = xref
            result.append(data)
        except (ValueError, TypeError, AttributeError):
            continue
    return result


def contents(page, refs):
    page.parent.xref_set_key(page.xref, 'Contents', '[' + ' '.join(f'{x} 0 R' for x in refs) + ']')


@contextmanager
def without_boxes(page, identifiers=None):
    original = page.get_contents()
    hidden = {b['xref'] for b in boxes(page) if identifiers is None or b['id'] in identifiers}
    try:
        if hidden:
            contents(page, [x for x in original if x not in hidden])
        yield page
    finally:
        if hidden:
            contents(page, original)


def font_name(style):
    pair = (bool(style.get('bold')), bool(style.get('italic')))
    names = {'Arial': ('helv', 'heit', 'hebo', 'hebi'),
             'Times New Roman': ('tiro', 'tiit', 'tibo', 'tibi'),
             'Courier New': ('cour', 'coit', 'cobo', 'cobi')}
    return names[style['family']][int(pair[0]) * 2 + int(pair[1])]


def rgb(value):
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)) if value else None


@lru_cache(maxsize=12)
def metric_font(name):
    return fitz.Font(name)


def layout(box, check_height=True, with_height=False):
    """Lay out styled runs without dropping overflowing text."""
    rect = fitz.Rect(box['rect'])
    width, height = rect.width - 8, rect.height - 8
    if width < 4 or height < 4:
        raise ValueError('Make the box larger before adding text.')
    fonts, chars = {}, []
    for run in box['runs']:
        style = dict(DEFAULT_STYLE, **run['style'])
        size = float(style['size'])
        if not 4 <= size <= 200:
            raise ValueError('Font size must be between 4 and 200 points.')
        name = font_name(style)
        if name not in fonts:
            fonts[name] = metric_font(name)
        font = fonts[name]
        for char in run['text'].replace('\r\n', '\n').replace('\r', '\n').replace('\t', '    '):
            if char != '\n' and (ord(char) > 255 or not font.has_glyph(ord(char))):
                raise ValueError('Added text boxes currently support Latin characters. Use a supported character.')
            chars.append(dict(char=char, style=style, font=name,
                              width=font.text_length(char, fontsize=size) if char != '\n' else 0,
                              ascent=font.ascender * size, descent=-font.descender * size))
    rows, row, used = [], [], 0.
    for char in chars:
        if char['char'] == '\n':
            rows.append((row, char))
            row = []
            used = 0.
            continue
        if char['width'] > width + .01:
            raise ValueError('The box is narrower than a letter. Widen it or reduce the font size.')
        while row and used + char['width'] > width + .01:
            split = next((i + 1 for i in range(len(row) - 1, -1, -1) if row[i]['char'].isspace()), len(row))
            rows.append((row[:split], row[0]))
            row = row[split:]
            used = sum(c['width'] for c in row)
        row.append(char)
        used += char['width']
    if row or (chars and chars[-1]['char'] == '\n'):
        rows.append((row, chars[-1]))
    y, placed = 4., []
    for row, fallback in rows:
        asc = max((c['ascent'] for c in row), default=fallback['ascent'])
        desc = max((c['descent'] for c in row), default=fallback['descent'])
        if check_height and y + asc + desc > rect.height - 4 + .01:
            raise ValueError('Text needs more height. Enlarge the box or reduce the font size; no text was discarded.')
        row_width = sum(c['width'] for c in row)
        x = 4 + (width - row_width) * {'left': 0, 'center': .5, 'right': 1}[box['align']]
        for c in row:
            placed.append((x, y + asc, c))
            x += c['width']
        y += (asc + desc) * 1.08
    required = (y - (asc + desc) * .08 + 4) if rows else 8
    return (placed, required) if with_height else placed


def fit_box(box, bounds):
    """Grow to fit without shrinking fonts; shift upward at the page edge."""
    fitted = deepcopy(box)
    bounds = fitz.Rect(bounds)
    rect = fitz.Rect(box['rect'])
    if rect.is_empty:
        raise ValueError('Draw a text box inside the page.')
    longest, word = 0., 0.
    for run in box['runs']:
        style = dict(DEFAULT_STYLE, **run['style'])
        font = metric_font(font_name(style))
        for char in run['text']:
            if char.isspace():
                longest, word = max(longest, word), 0.
            else:
                word += font.text_length(char, fontsize=style['size'])
    longest = max(longest, word)
    default = dict(DEFAULT_STYLE, **box.get('default', {}))
    minimum_width = max(12., longest + 8)
    width = min(bounds.width, max(rect.width, minimum_width))
    rect.x0 = max(bounds.x0, min(rect.x0, bounds.x1 - width))
    rect.x1 = rect.x0 + width
    rect.y1 = max(rect.y1, rect.y0 + 12)
    fitted['rect'] = list(rect)
    placed, height = layout(fitted, check_height=False, with_height=True)
    if not fitted['runs']:
        font = metric_font(font_name(default))
        height = (font.ascender - font.descender) * default['size'] + 8
    if height > bounds.height + .01 and width < bounds.width:
        rect.x0, rect.x1 = bounds.x0, bounds.x1
        fitted['rect'] = list(rect)
        placed, height = layout(fitted, check_height=False, with_height=True)
    if height > bounds.height + .01:
        raise ValueError('Text exceeds the page height even at full width. Split it into another box or page.')
    height = min(bounds.height, max(rect.height, height))
    rect.y0 = max(bounds.y0, min(rect.y0, bounds.y1 - height))
    rect.y1 = rect.y0 + height
    fitted['rect'] = list(rect)
    return fitted, placed


def put_box(doc, index, box):
    page = doc[index]
    box, placed = fit_box(box, fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height))
    rect = fitz.Rect(box['rect'])
    if rect.is_empty or not fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height).contains(rect):
        raise ValueError('Keep the text box inside the page.')
    existing = next((b for b in boxes(page) if b['id'] == box['id']), None)
    before = page.get_contents()
    with fitz.open() as source:
        canvas = source.new_page(width=rect.width, height=rect.height)
        # Even an empty transparent box needs its own drawing stream.
        canvas.draw_rect(canvas.rect + (.5, .5, -.5, -.5), color=rgb(box['border']),
                         fill=rgb(box['fill']), width=1)
        runs = []
        for x, y, char in placed:
            if runs and runs[-1]['style'] == char['style'] and runs[-1]['y'] == y:
                runs[-1]['text'] += char['char']
                runs[-1]['width'] += char['width']
            else:
                runs.append(dict(x=x, y=y, text=char['char'], style=char['style'], font=char['font'], width=char['width']))
        shape = canvas.new_shape()
        for run in runs:
            x, y, char = run['x'], run['y'], run
            s = char['style']
            shape.insert_text((x, y), char['text'], fontname=char['font'],
                               fontsize=s['size'], color=rgb(s['color']))
            if s.get('underline'):
                shape.draw_line((x, y + s['size'] * .1), (x + char['width'], y + s['size'] * .1))
                shape.finish(color=rgb(s['color']), width=max(.5, s['size'] / 18))
        shape.commit()
        page.show_pdf_page(rect, source, 0)
    new_refs = [x for x in page.get_contents() if x not in before]
    if len(new_refs) != 1:
        raise RuntimeError('Could not create an independent text box.')
    stream = new_refs[0]
    data = {k: v for k, v in box.items() if k != 'xref'}
    data['version'] = 1
    doc.xref_set_key(stream, KEY, fitz.get_pdf_str(json.dumps(data, ensure_ascii=True)))
    if existing:
        contents(page, [stream if x == existing['xref'] else x for x in before])
    return stream


def delete_box(doc, index, identifier):
    page = doc[index]
    target = next((b for b in boxes(page) if b['id'] == identifier), None)
    if target:
        contents(page, [x for x in page.get_contents() if x != target['xref']])


def apply_redactions(page, preserve_native=False, **options):
    """Preserve untouched boxes; remove metadata for any box being redacted."""
    areas = [a.rect for a in page.annots() or [] if a.type[0] == fitz.PDF_ANNOT_REDACT]
    from native_layers import layers, KEY as NATIVE_KEY, restore_font_resource
    native = []
    fonts = {font[4]: font[0] for font in page.get_fonts(full=True) if not font[-1]}
    for section in layers(page):
        if not preserve_native and any(fitz.Rect(section['rect']).intersects(r) for r in areas):
            page.parent.xref_set_key(section['_stream'], NATIVE_KEY, 'null')
        else:
            native.append(section)
    detached = []
    for box in boxes(page):
        if not preserve_native and any(fitz.Rect(box['rect']).intersects(rect) for rect in areas):
            page.parent.xref_set_key(box['xref'], KEY, 'null')
        else:
            detached.append(box)
    refs = page.get_contents()
    if detached or native:
        hidden = {b['xref'] for b in detached} | {s['_stream'] for s in native}
        contents(page, [x for x in refs if x not in hidden])
    result = page.apply_redactions(**options)
    for section in native:
        name = section['_font_resource']
        restore_font_resource(page, name, fonts[name])
    if native:
        contents(page, page.get_contents() + [s['_stream'] for s in native])
    # MuPDF removes unused resources during redaction. Rebuild detached boxes
    # instead of restoring dangling references to their former Form XObjects.
    for box in detached:
        put_box(page.parent, page.number, box)
    return result


def move_page(doc, source, target):
    """Move to a final zero-based index, retaining the actual page object."""
    if not 0 <= source < len(doc) or not 0 <= target < len(doc):
        raise ValueError('Page position is outside the document.')
    if source != target:
        doc.move_page(source, target if target < source else (-1 if target == len(doc) - 1 else target + 1))

