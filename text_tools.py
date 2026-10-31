"""Character-level selection and style-preserving replacement."""
import io
import re
import hashlib
import fitz
from rich_boxes import apply_redactions


def lines(page):
    result = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            chars = []
            for span in line['spans']:
                style = {k: v for k, v in span.items() if k != 'chars'}
                for char in span['chars']:
                    chars.append(dict(char, style=style))
            if chars:
                result.append({'chars': chars, 'dir': line['dir'], 'bbox': line['bbox']})
    return result


def find_matches(doc, query, page_indices=None, line_provider=None):
    if not query:
        return []
    matches = []
    for index in (range(len(doc)) if page_indices is None else page_indices):
        page = doc[index]
        for line in (line_provider(index) if line_provider else lines(page)):
            text = ''.join(c['c'] for c in line['chars'])
            for found in re.finditer(re.escape(query), text, re.IGNORECASE):
                chars = line['chars'][found.start():found.end()]
                rect = fitz.Rect(chars[0]['bbox'])
                for char in chars[1:]:
                    rect |= fitz.Rect(char['bbox'])
                following = line['chars'][found.end():]
                limit = next((c['bbox'][0] for c in following if not c['c'].isspace()), page.cropbox.width - 12)
                matches.append({'page': index, 'rect': tuple(rect), 'text': found.group(),
                                'chars': chars, 'style': chars[0]['style'],
                                'origin': chars[0]['origin'], 'dir': line['dir'],
                                'right_limit': max(rect.x1, limit), 'context': text})
    return matches


def select_text(page, start, end, all_lines=None):
    """Return quads for a reading-order range between two page points."""
    all_lines = lines(page) if all_lines is None else all_lines
    flattened = [(i, c) for i, line in enumerate(all_lines) for c in line['chars']]
    if not flattened:
        return [], ''
    def closest(point):
        def distance(item):
            rect = fitz.Rect(item[1]['bbox'])
            dx = max(rect.x0 - point.x, 0, point.x - rect.x1)
            dy = max(rect.y0 - point.y, 0, point.y - rect.y1)
            return dx * dx + dy * dy
        return min(range(len(flattened)), key=lambda n: distance(flattened[n]))
    a, b = sorted((closest(fitz.Point(start)), closest(fitz.Point(end))))
    groups = {}
    for line_id, char in flattened[a:b + 1]:
        groups.setdefault(line_id, []).append(char)
    quads, text = [], []
    for line_id, chars in groups.items():
        line = all_lines[line_id]
        # Character quads retain the baseline orientation, including rotated text.
        if abs(line['dir'][1]) < 0.001 and line['dir'][0] > 0:
            rect = fitz.Rect(chars[0]['bbox'])
            for c in chars[1:]:
                rect |= fitz.Rect(c['bbox'])
            quads.append(rect.quad)
        else:
            for char in chars:
                quads.append(fitz.recover_char_quad(line['dir'], char['style'], char))
        text.append(''.join(c['c'] for c in chars))
    return quads, '\n'.join(text)


def font_for(doc, page, style, text):
    """Reuse embedded font outlines; repair subsets lacking a Unicode cmap."""
    name = style['font']
    def plain(value):
        return value.split('+')[-1].replace(' ', '').lower()
    for xref, ext, kind, base, resource, *_ in page.get_fonts(full=True):
        if plain(base) != plain(name):
            continue
        data = doc.extract_font(xref)[3]
        if data:
            cache = getattr(doc, '_opdf_fonts', None)
            if cache is None:
                cache = doc._opdf_fonts = {}
            key = (plain(name), hashlib.sha256(data).digest())
            cached = cache.get(key)
            if cached and all(cached[0].has_glyph(ord(c)) for c in set(text)):
                return cached
            font = fitz.Font(fontbuffer=data)
            if not all(font.has_glyph(ord(c)) for c in text):
                # ReportLab subsets often carry only a Mac cmap. PDF text traces
                # supply the actual Unicode -> glyph-id mapping without guessing.
                from fontTools.ttLib import TTFont
                from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
                tt = TTFont(io.BytesIO(data))
                mapping = dict(tt.getBestCmap() or {})
                glyph_count = len(tt.getGlyphOrder())
                for source_page in doc:
                    for trace in source_page.get_texttrace():
                        if plain(trace['font']) == plain(name):
                            for unicode, gid, *_ in trace['chars']:
                                if 0 <= unicode <= 0xFFFF and 0 < gid < glyph_count:
                                    mapping[unicode] = tt.getGlyphName(gid)
                # Some PDF subsets have a Macintosh-only cmap. Recover its
                # ASCII glyphs after verifying it agrees with observed PDF text.
                # Do not guess the custom high-byte encoding used by subsets.
                for table in tt['cmap'].tables:
                    if table.platformID == 1 and table.platEncID == 0:
                        ascii_map = {code: glyph for code, glyph in table.cmap.items() if 32 <= code < 127}
                        shared = set(ascii_map) & set(mapping)
                        if shared and all(ascii_map[c] == mapping[c] for c in shared):
                            for code, glyph in ascii_map.items():
                                mapping.setdefault(code, glyph)
                cmap = CmapSubtable.newSubtable(4)
                cmap.platformID, cmap.platEncID, cmap.language = 3, 1, 0
                cmap.cmap = mapping
                tt['cmap'].tables = [t for t in tt['cmap'].tables if not (t.platformID == 3 and t.platEncID == 1)] + [cmap]
                buffer = io.BytesIO()
                tt.save(buffer)
                tt.close()
                data = buffer.getvalue()
                font = fitz.Font(fontbuffer=data)
            missing = sorted(set(c for c in text if not font.has_glyph(ord(c))))
            if missing:
                raise ValueError('The embedded font lacks these replacement characters: ' + ''.join(missing) +
                                 '. Choose text supported by the font. The document was not changed.')
            cache[key] = (font, data, None)
            if len(cache) > 32:
                del cache[next(iter(cache))]
            return cache[key]
        aliases = {'helvetica': 'helv', 'helvetica-bold': 'hebo', 'helvetica-oblique': 'heit',
                   'helvetica-boldoblique': 'hebi', 'times-roman': 'tiro', 'times-bold': 'tibo',
                   'times-italic': 'tiit', 'times-bolditalic': 'tibi', 'courier': 'cour',
                   'courier-bold': 'cobo', 'courier-oblique': 'coit', 'courier-boldoblique': 'cobi'}
        alias = aliases.get(plain(base))
        if alias:
            font = fitz.Font(alias)
            if all(ord(c) <= 255 and font.has_glyph(ord(c)) for c in text):
                return font, None, alias
    raise ValueError(f'Cannot safely reuse font {name}. No font substitution was made.')


def removal_rects(chars):
    """Merge adjacent glyph bounds on one baseline, never across gaps/rows.

    Hundreds of per-character redaction annotations make MuPDF's annotation
    lookup quadratic. Contiguous line segments remove the same glyphs with
    usually one annotation per line.
    """
    segments = []
    for char in sorted(chars, key=lambda c: (round(c['origin'][1], 1), c['bbox'][0])):
        rect = fitz.Rect(char['bbox'])
        if rect.width <= .2 or rect.height <= .2:
            continue
        baseline = char['origin'][1]
        if segments and abs(segments[-1][0] - baseline) < .1 and rect.x0 <= segments[-1][1].x1 + .1:
            segments[-1][1] |= rect
        else:
            segments.append([baseline, rect])
    return [rect + (.05, .05, -.05, -.05) for _, rect in segments]


def replace_match(doc, match, text):
    page = doc[match['page']]
    style = match['style']
    if tuple(match['dir']) != (1.0, 0.0):
        raise ValueError('Replacement currently supports horizontal text, including rotated PDF pages.')
    if '\n' in text or '\r' in text:
        raise ValueError('Use a single-line replacement.')
    if any(any(c['style'].get(k) != style.get(k) for k in ('font', 'size', 'color', 'alpha')) for c in match['chars']):
        raise ValueError('This match spans multiple text styles. Select a shorter match within one style.')
    if any(a.type[0] == fitz.PDF_ANNOT_REDACT for a in page.annots() or []):
        raise ValueError('Apply or remove existing redaction annotations before replacing text.')
    font, data, alias = font_for(doc, page, style, text) if text else (None, None, None)
    if text:
        width = font.text_length(text, fontsize=style['size'])
        if match['origin'][0] + width > match['right_limit'] + 0.25:
            raise ValueError('Replacement would overlap following text or the page edge at the original font size. '
                             'Use shorter text; the font size will not be silently changed.')
        if data:
            alias = 'OPDF' + str(doc.xref_length())
    # Transparent redaction removes only text; keep image/vector backgrounds.
    for r in removal_rects(match['chars']):
        page.add_redact_annot(r, fill=False, cross_out=False)
    apply_redactions(page, images=0, graphics=0, text=0)
    if text:
        if data:
            page.insert_font(fontname=alias, fontbuffer=data)
        color = fitz.sRGB_to_pdf(style['color'])
        page.insert_text(match['origin'], text, fontname=alias, fontsize=style['size'],
                         color=color, fill_opacity=style.get('alpha', 255) / 255)

