"""Run: python benchmarks/editor.py [optional PDF paths ...]."""
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fitz
from box_tools import text_sections, edit_section, remove_section
from text_tools import removal_rects


def synthetic():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox((40, 40, 540, 780), 'A useful paragraph with words to drag and edit. ' * 24, fontsize=12)
    section = max(text_sections(page), key=lambda s: len(s['text']))
    start = time.perf_counter()
    edit_section(doc, 0, section, '')
    return dict(case='1151-character paragraph removal', characters=len(section['text']),
                removal_regions=len(removal_rects(section['chars'])), elapsed_ms=(time.perf_counter() - start) * 1000)


def supplied(path):
    with fitz.open(path) as doc:
        section = max(text_sections(doc[0]), key=lambda s: len(s['text']))
        start = time.perf_counter()
        with fitz.open() as preview:
            preview.insert_pdf(doc, from_page=0, to_page=0)
            remove_section(preview[0], section)
            preview[0].get_pixmap()
        return dict(case=Path(path).name, characters=len(section['text']),
                    preview_copy_remove_render_ms=(time.perf_counter() - start) * 1000)


if __name__ == '__main__':
    print(json.dumps([synthetic()] + [supplied(p) for p in sys.argv[1:]], indent=2))

