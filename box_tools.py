"""Detect editable sections and reflow text using the original embedded font."""
import re
import statistics
import fitz
from text_tools import font_for


def style_key(style):
    return tuple(style.get(k) for k in ('font', 'size', 'color', 'alpha', 'flags'))


def text_sections(page):
    result = []
    for block in page.get_text('rawdict')['blocks']:
        source_lines = block.get('lines', [])
        if not source_lines:
            continue
        spans = [s for line in source_lines for s in line['spans'] if s['chars']]
        if not spans:
            continue
        homogeneous = len({style_key(s) for s in spans}) == 1
        # Mixed formatting remains separate, independently editable runs.
        groups = [source_lines] if homogeneous else [
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
    return result


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


def edit_section(doc, index, section, text, rect=None):
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
    current = text_sections(page)
    if not any(s['rect'] == section['rect'] and s['text'] == section['text'] for s in current):
        raise ValueError('This section changed. Close the editor and select it again.')
    style = section['style']
    font = data = alias = None
    placements = []
    if text:
        clean = text.replace('\n', '').replace('\r', '').replace('\t', ' ')
        font, data, alias = font_for(doc, page, style, clean)
        wrapped = wrap_text(text, font, style['size'], target.width)
        offset = section['origin'][1] - original.y0
        y = target.y0 + offset
        below_baseline = max(0, original.y1 - section['chars'][-1]['origin'][1])
        line_height = section['line_height']
        if y + max(0, len(wrapped) - 1) * line_height + below_baseline > target.y1 + 0.5:
            raise ValueError('Text needs more height at its original size. Drag the box’s lower-right corner downward.')
        for row in wrapped:
            if row:
                occupied = fitz.Rect(target.x0, y - offset,
                                     target.x0 + font.text_length(row, fontsize=style['size']),
                                     y + below_baseline)
                for other in current:
                    if other['rect'] == section['rect']:
                        continue
                    intersection = occupied & fitz.Rect(other['rect'])
                    if not intersection.is_empty and intersection.width > 0.5 and intersection.height > 0.5:
                        raise ValueError('This edit would overlap another text section. Resize the box or shorten the text.')
                placements.append(((target.x0, y), row))
            y += line_height
        if data:
            alias = 'OPDFBOX' + str(doc.xref_length())
    try:
        for char in section['chars']:
            r = fitz.Rect(char['bbox'])
            if r.width > 0.2 and r.height > 0.2:
                r += (0.05, 0.05, -0.05, -0.05)
                page.add_redact_annot(r, fill=False, cross_out=False)
        page.apply_redactions(images=0, graphics=0, text=0)
        if placements:
            if data:
                page.insert_font(fontname=alias, fontbuffer=data)
            for point, row in placements:
                page.insert_text(point, row, fontname=alias, fontsize=style['size'],
                                 color=fitz.sRGB_to_pdf(style['color']),
                                 fill_opacity=style.get('alpha', 255) / 255)
    except Exception:
        # Callers retain full document snapshots for rollback; never hide errors.
        raise
    return len(placements)
