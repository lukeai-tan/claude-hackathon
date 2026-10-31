"""Keep edited native sections independently movable, including when overlapped."""
from contextlib import contextmanager
import json
import uuid
import fitz

KEY = 'OpenPDFNativeSection'


def layers(page):
    result = []
    for xref in page.get_contents():
        kind, value = page.parent.xref_get_key(xref, KEY)
        if kind != 'string':
            continue
        try:
            section = json.loads(value)
            section['_stream'] = xref
            section['rect'] = tuple(section['rect'])
            result.append(section)
        except (ValueError, KeyError, TypeError):
            pass
    return result


def set_contents(page, refs):
    page.parent.xref_set_key(page.xref, 'Contents', '[' + ' '.join(f'{r} 0 R' for r in refs) + ']')


@contextmanager
def without_layers(page):
    original = page.get_contents()
    hidden = {s['_stream'] for s in layers(page)}
    try:
        if hidden:
            set_contents(page, [r for r in original if r not in hidden])
        yield
    finally:
        if hidden:
            set_contents(page, original)


def remove_layer(page, section):
    identifier = section.get('_layer_id')
    if not identifier:
        return False
    matches = {s['_stream'] for s in layers(page) if s['_layer_id'] == identifier}
    if not matches:
        raise ValueError('This text section changed. Select it again.')
    set_contents(page, [r for r in page.get_contents() if r not in matches])
    return True


def register_layer(page, stream, prior, text, font_resource):
    original = page.get_contents()
    try:
        set_contents(page, [stream])
        spans = [s for b in page.get_text('rawdict')['blocks'] for line in b.get('lines', []) for s in line['spans'] if s['chars']]
    finally:
        set_contents(page, original)
    chars = [c for s in spans for c in s['chars']]
    if not chars:
        return
    rect = fitz.Rect(chars[0]['bbox'])
    for char in chars[1:]:
        rect |= fitz.Rect(char['bbox'])
    section = dict(rect=list(rect), text=text, chars=chars,
                   style={k: v for k, v in spans[0].items() if k != 'chars'},
                   origin=chars[0]['origin'], line_height=prior['line_height'],
                   ascent=max(c['origin'][1] - c['bbox'][1] for c in chars),
                   descent=max(c['bbox'][3] - c['origin'][1] for c in chars),
                   _layer_id=prior.get('_layer_id') or uuid.uuid4().hex,
                   _font_resource=font_resource)
    page.parent.xref_set_key(stream, KEY, fitz.get_pdf_str(json.dumps(section)))


def restore_font_resource(page, name, xref):
    """Reattach only fonts of preserved layers, never redacted resources."""
    doc = page.parent
    owner, prefix = page.xref, 'Resources/'
    kind, value = doc.xref_get_key(page.xref, 'Resources')
    if kind == 'xref':
        owner, prefix = int(value.split()[0]), ''
    kind, value = doc.xref_get_key(owner, prefix + 'Font')
    if kind == 'xref':
        owner, prefix = int(value.split()[0]), ''
    else:
        if kind == 'null':
            doc.xref_set_key(owner, prefix + 'Font', '<<>>')
        prefix += 'Font/'
    doc.xref_set_key(owner, prefix + name, f'{xref} 0 R')

