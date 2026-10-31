import unittest
from unittest.mock import patch
import fitz
from box_tools import text_sections, remove_section
from render_tools import PageCache, pixmap_image
from text_tools import removal_rects, find_matches, lines


class PerformanceTests(unittest.TestCase):
    def test_long_paragraph_removal_uses_line_regions_not_character_objects(self):
        with fitz.open() as doc:
            page = doc.new_page()
            page.insert_textbox((40, 40, 540, 780), 'A useful paragraph with words to drag and edit. ' * 24, fontsize=12)
            section = text_sections(page)[0]
            self.assertGreater(len(section['chars']), 1000)
            self.assertLess(len(removal_rects(section['chars'])), 30)
            original, calls = fitz.Page.add_redact_annot, []
            def record(page, *args, **kwargs):
                calls.append(args)
                return original(page, *args, **kwargs)
            with patch.object(fitz.Page, 'add_redact_annot', record):
                remove_section(page, section)
            self.assertLess(len(calls), 30)
            self.assertFalse(page.get_text().strip())

    def test_grouped_removal_does_not_bridge_unrelated_text_in_a_gap(self):
        with fitz.open() as doc:
            page = doc.new_page()
            for x, text in [(40, 'Left'), (140, 'Keep'), (240, 'Right')]:
                page.insert_text((x, 50), text)
            source = lines(page)
            chars = [c for line in source for c in line['chars'] if c['bbox'][0] < 100 or c['bbox'][0] > 230]
            remove_section(page, {'chars': chars})
            self.assertEqual(page.get_text().strip(), 'Keep')

    def test_cache_invalidates_only_edited_page_and_resets_on_restore(self):
        cache, doc = PageCache(), object()
        first, second = object(), object()
        self.assertIs(cache.get(doc, 'sections', 0, lambda: first), first)
        cache.get(doc, 'sections', 1, lambda: second)
        cache.invalidate({0})
        replacement = object()
        self.assertIs(cache.get(doc, 'sections', 0, lambda: replacement), replacement)
        self.assertIs(cache.get(doc, 'sections', 1, lambda: None), second)
        self.assertIsNone(cache.get(object(), 'sections', 1, lambda: None))

    def test_cache_is_bounded(self):
        cache, doc = PageCache(limit=3), object()
        for i in range(40):
            cache.get(doc, 'sections', i, lambda: i)
            cache.get(doc, 'image', i, lambda: i)
        self.assertEqual(len(cache.data), 5)

    def test_cached_search_matches_uncached_search(self):
        with fitz.open() as doc:
            for _ in range(3):
                doc.new_page().insert_text((40, 50), 'Find this word')
            cached = {i: lines(doc[i]) for i in range(3)}
            self.assertEqual(find_matches(doc, 'word'), find_matches(doc, 'word', line_provider=cached.__getitem__))
            self.assertEqual(len(find_matches(doc, 'word', page_indices=[1])), 1)

    def test_direct_pixels_match_png_render(self):
        import io
        from PIL import Image
        with fitz.open() as doc:
            page = doc.new_page(width=100, height=100)
            page.draw_rect(page.rect, fill=(.2, .4, .6))
            pix = page.get_pixmap()
            self.assertEqual(pixmap_image(pix).tobytes(), Image.open(io.BytesIO(pix.tobytes('png'))).tobytes())
