"""Detect editable sections and reflow text using the original embedded font."""
import re
import statistics
import fitz
from text_tools import font_for, removal_rects
from rich_boxes import without_boxes, apply_redactions
from native_layers import layers, without_layers, remove_layer, register_layer


def style_key(style):
    return tuple(style.get(k) for k in ('font', 'size', 'color', 'alpha', 'flags'))


def paragraph_groups(source_lines):
    """Same style does not make side-by-side cells a multiline paragraph."""
    groups = []
    for line in source_lines:
        if not any(s['chars'] for s in line['spans']):
            continue
        if groups:
            previous = groups[-1][-1]
            a, b = fitz.Rect(previous['bbox']), fitz.Rect(line['bbox'])
            first = next(s for s in line['spans'] if s['chars'])
            prior = next(s for s in previous['spans'] if s['chars'])
            gap = first['chars'][0]['origin'][1] - prior['chars'][0]['origin'][1]
            overlap = min(a.x1, b.x1) - max(a.x0, b.x0)
            aligned = overlap > min(a.width, b.width) * .3 or abs(a.x0 - b.x0) < first['size']
            if .5 < gap <= first['size'] * 3 and aligned:
                groups[-1].append(line)
                continue
        groups.append([line])
    return groups


def compact_text(text):
    """Collapse unused lines inside the edited section, retaining nonblank rows."""
    return '\n'.join(line.rstrip() for line in text.replace('\r\n', '\n').replace('\r', '\n').split('\n') if line.strip())


def text_sections(page):
    result = []
    with without_boxes(page), without_layers(page):
        blocks = page.get_text('rawdict')['blocks']
    for block in blocks:
        source_lines = block.get('lines', [])
        if not source_lines:
            continue
        spans = [s for line in source_lines for s in line['spans'] if s['chars']]
        if not spans:
            continue
        homogeneous = len({style_key(s) for s in spans}) == 1
        # Mixed formatting remains separate, independently editable runs.
        groups = paragraph_groups(source_lines) if homogeneous else [
            [dict(line, spans=[span], bbox=span['bbox'])]
            for line in source_lines for span in line['spans'] if span['chars']]
        for group in groups:
            if any(abs(line['dir'][1]) > 0.001 or line['dir'][0] < 0 for line in group):
                continue
            chars = [c for line in group for s in line['spans'] for c in s['chars']]
            if not chars or not any(c['c'].strip() for c in chars):
                continue
            first = group[0]['spans'][0]
            rect = fitz.Rect(chars[0]['bbox'])
            for c in chars[1:]:
                rect |= fitz.Rect(c['bbox'])
            text = '\n'.join(''.join(c['c'] for s in line['spans'] for c in s['chars']) for line in group)
            baselines = [line['spans'][0]['chars'][0]['origin'][1] for line in group]
            gaps = [b - a for a, b in zip(baselines, baselines[1:]) if b > a]
            result.append({'rect': tuple(rect), 'text': text, 'chars': chars,
                           'style': {k: v for k, v in first.items() if k != 'chars'},
                           'origin': chars[0]['origin'],
                           'line_height': statistics.median(gaps) if gaps else rect.height * 1.1})
    # Replacement tools often append a new PDF text object inside an existing
    # line. Reunite same-style overlapping objects into a single editable box.
    merged = True
    while merged:
        merged = False
        for i, left in enumerate(result):
            for j in range(i + 1, len(result)):
                right = result[j]
                if style_key(left['style']) != style_key(right['style']):
                    continue
                if not fitz.Rect(left['rect']).intersects(fitz.Rect(right['rect'])):
                    continue
                chars = left['chars'] + right['chars']
                rows = []
                for char in sorted(chars, key=lambda c: (round(c['origin'][1], 1), c['origin'][0])):
                    if not rows or abs(rows[-1][0]['origin'][1] - char['origin'][1]) > 0.5:
                        rows.append([])
                    rows[-1].append(char)
                left['chars'] = [c for row in rows for c in row]
                left['text'] = '\n'.join(''.join(c['c'] for c in sorted(row, key=lambda c: c['origin'][0])) for row in rows)
                left['rect'] = tuple(fitz.Rect(left['rect']) | fitz.Rect(right['rect']))
                left['origin'] = left['chars'][0]['origin']
                result.pop(j)
                merged = True
                break
            if merged:
                break
    for section in result:
        # Merged PDF objects can arrive out of reading order. Measure individual
        # glyph ascents/descents and actual baseline gaps, never a whole block
        # against whichever character happened to be extracted last.
        chars = section['chars']
        baselines = sorted({round(c['origin'][1], 2) for c in chars})
        gaps = [b - a for a, b in zip(baselines, baselines[1:]) if b - a > .5]
        section['ascent'] = max(c['origin'][1] - c['bbox'][1] for c in chars)
        section['descent'] = max(c['bbox'][3] - c['origin'][1] for c in chars)
        section['line_height'] = statistics.median(gaps) if gaps else (section['ascent'] + section['descent']) * 1.1
    return result + layers(page)


def wrap_text(text, font, size, width):
    """Preserve explicit newlines and wrap at whitespace, splitting long words."""
    output = []
    for paragraph in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        current = ''
        for token in re.findall(r'\S+|[ \t]+', paragraph):
            token = token.replace('\t', '    ')
            if font.text_length(current + token, fontsize=size) <= width + 0.2:
                current += token
                continue
            if token.isspace():
                if current:
                    output.append(current.rstrip())
                    current = ''
                continue
            if current:
                output.append(current.rstrip())
                current = ''
            for char in token:
                if font.text_length(char, fontsize=size) > width + 0.2:
                    raise ValueError('The box is narrower than one character. Widen it.')
                if current and font.text_length(current + char, fontsize=size) > width + 0.2:
                    output.append(current)
                    current = ''
                current += char
        output.append(current.rstrip())
    return output


def remove_section(page, section):
    if remove_layer(page, section):
        return
    for rect in removal_rects(section['chars']):
        page.add_redact_annot(rect, fill=False, cross_out=False)
    apply_redactions(page, preserve_native=True, images=0, graphics=0, text=0)


def edit_section(doc, index, section, text, rect=None, current_sections=None):
    page = doc[index]
    original = fitz.Rect(section['rect'])
    target = fitz.Rect(rect or original)
    bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
    if target.is_empty or not bounds.contains(target):
        raise ValueError('Keep the text box inside the page.')
    if any(a.type[0] == fitz.PDF_ANNOT_REDACT for a in page.annots() or []):
        raise ValueError('Apply or remove existing redaction annotations first.')
    # The editor holds the original section; reject stale edits without deleting
    # something else if the document was changed through another control.
    current = text_sections(page) if current_sections is None else current_sections
    if not any(s['rect'] == section['rect'] and s['text'] == section['text'] for s in current):
        raise ValueError('This section changed. Close the editor and select it again.')
    style = section['style']
    font = data = alias = None
    placements = []
    text = compact_text(text)
    if text:
        clean = text.replace('\n', '').replace('\r', '').replace('\t', ' ')
        font, data, alias = font_for(doc, page, style, clean)
        wrapped = wrap_text(text, font, style['size'], target.width)
        offset = section.get('ascent', section['origin'][1] - original.y0)
        y = target.y0 + offset
        below_baseline = section.get('descent', max(c['bbox'][3] - c['origin'][1] for c in section['chars']))
        line_height = section['line_height']
        required_bottom = y + max(0, len(wrapped) - 1) * line_height + below_baseline
        if required_bottom > bounds.y1 + .5:
            raise ValueError('Text needs more height than remains on this page. Widen the box, move it upward or shorten the text.')
        # Native PDF boxes are detected glyph bounds, not fixed-height frames.
        # Let the replacement grow into free space, preserving font size. Its
        # detected bounds naturally shrink again when the text becomes shorter.
        target.y1 = max(target.y1, required_bottom)
        for row in wrapped:
            if row:
                placements.append(((target.x0, y), row))
            y += line_height
        if data:
            alias = 'OPDFBOX' + str(doc.xref_length())
    try:
        remove_section(page, section)
        if placements:
            if data:
                page.insert_font(fontname=alias, fontbuffer=data)
            shape = page.new_shape()
            for point, row in placements:
                shape.insert_text(point, row, fontname=alias, fontsize=style['size'],
                                 color=fitz.sRGB_to_pdf(style['color']),
                                 fill_opacity=style.get('alpha', 255) / 255)
            before_streams = set(page.get_contents())
            shape.commit()
            stream = next(r for r in page.get_contents() if r not in before_streams)
            register_layer(page, stream, section, '\n'.join(row for _, row in placements), alias)
    except Exception:
        # Callers retain full document snapshots for rollback; never hide errors.
        raise
    return len(placements)

