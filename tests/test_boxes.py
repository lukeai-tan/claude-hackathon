import unittest
import fitz
from core import PDF
from box_tools import text_sections, edit_section


class BoxTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        p = self.pdf.doc.new_page()
        p.draw_rect(p.rect, color=None, fill=(0.1, 0.15, 0.2))
        p.insert_text((50, 100), 'Editable paragraph', fontsize=18, fontname='hebo', color=(0.8, 0.9, 0.7))
        p.insert_text((50, 250), 'Keep this separate', fontsize=12)

    def tearDown(self):
        self.pdf.close()

    def test_edit_section_preserves_background_and_style(self):
        section = next(s for s in text_sections(self.pdf.doc[0]) if 'Editable' in s['text'])
        edit_section(self.pdf.doc, 0, section, 'Live edit')
        self.assertNotIn('Editable', self.pdf.doc[0].get_text())
        self.assertIn('Keep this separate', self.pdf.doc[0].get_text())
        new = next(s for s in text_sections(self.pdf.doc[0]) if 'Live edit' in s['text'])
        for key in ('font', 'size', 'color'):
            self.assertEqual(new['style'][key], section['style'][key])
        self.assertEqual(self.pdf.doc[0].get_pixmap().pixel(200, 95), (25, 38, 51))

    def test_resized_box_wraps(self):
        section = text_sections(self.pdf.doc[0])[0]
        rect = fitz.Rect(section['rect'])
        rect.y1 = 210
        count = edit_section(self.pdf.doc, 0, section, 'Several new words wrap naturally inside this editable text box.', rect)
        self.assertGreater(count, 1)
        self.assertIn('Several', self.pdf.doc[0].get_text())

    def test_overflow_keeps_original(self):
        section = text_sections(self.pdf.doc[0])[0]
        before = self.pdf.doc[0].get_text()
        with self.assertRaisesRegex(ValueError, 'height'):
            edit_section(self.pdf.doc, 0, section, 'a very long paragraph ' * 20)
        self.assertEqual(self.pdf.doc[0].get_text(), before)

    def test_neighbour_overlap_is_allowed(self):
        section = text_sections(self.pdf.doc[0])[0]
        rect = fitz.Rect(section['rect'])
        rect.y1 = 400
        edit_section(self.pdf.doc, 0, section, 'line\n' * 6 + 'collision', rect)
        self.assertIn('collision', self.pdf.doc[0].get_text())
        self.assertIn('Keep this separate', self.pdf.doc[0].get_text())

    def test_overlapped_native_sections_remain_independent_after_reopen(self):
        section = text_sections(self.pdf.doc[0])[0]
        target = fitz.Rect(section['rect']) + (0, 150, 0, 150)
        edit_section(self.pdf.doc, 0, section, 'Overlapping', target)
        self.pdf.restore(self.pdf.bytes())
        section = next(s for s in text_sections(self.pdf.doc[0]) if s['text'] == 'Overlapping')
        edit_section(self.pdf.doc, 0, section, 'Moved again', fitz.Rect(section['rect']) + (100, 30, 100, 30))
        self.assertIn('Keep this separate', self.pdf.doc[0].get_text())
        self.assertNotIn('Overlapping', self.pdf.doc[0].get_text())
        self.assertIn('Moved', self.pdf.doc[0].get_text())
        self.assertIn('again', self.pdf.doc[0].get_text())

    def test_editing_underneath_native_layer_preserves_layer(self):
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, 'Overlapping', fitz.Rect(section['rect']) + (0, 150, 0, 150))
        underneath = next(s for s in text_sections(self.pdf.doc[0]) if s['text'] == 'Keep this separate')
        edit_section(self.pdf.doc, 0, underneath, 'Underneath')
        self.assertIn('Overlapping', self.pdf.doc[0].get_text())
        self.assertIn('Underneath', self.pdf.doc[0].get_text())

    def test_true_redaction_removes_native_layer_metadata(self):
        from rich_boxes import apply_redactions
        from native_layers import layers
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, 'Secret text')
        page = self.pdf.doc[0]
        page.add_redact_annot(page.search_for('Secret')[0])
        apply_redactions(page, images=0, graphics=0, text=0)
        self.assertNotIn('Secret', page.get_text())
        self.assertEqual(layers(page), [])

    def test_mixed_styles_are_separate_editable_boxes(self):
        p = self.pdf.doc[0]
        p.insert_text((50, 300), 'Normal', fontsize=12)
        p.insert_text((100, 300), 'Bold', fontsize=12, fontname='hebo')
        boxes = text_sections(p)
        self.assertTrue(any(s['text'] == 'Normal' for s in boxes))
        self.assertTrue(any(s['text'] == 'Bold' for s in boxes))

    def test_delete_whole_section(self):
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, '')
        self.assertNotIn('Editable', self.pdf.doc[0].get_text())
        self.assertIn('Keep this separate', self.pdf.doc[0].get_text())

    def test_shorter_text_collapses_empty_lines_and_shrinks(self):
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, '\n\nShort\n\n')
        updated = next(s for s in text_sections(self.pdf.doc[0]) if s['text'] == 'Short')
        self.assertAlmostEqual(updated['origin'][1], section['origin'][1], places=3)
        self.assertLess(fitz.Rect(updated['rect']).width, fitz.Rect(section['rect']).width)
        self.assertEqual(updated['style']['size'], section['style']['size'])

    def test_side_by_side_cells_are_not_fake_multiline_boxes(self):
        page = self.pdf.doc[0]
        page.insert_text((50, 350), 'First cell', fontsize=12)
        page.insert_text((250, 350), 'Second cell', fontsize=12)
        sections = text_sections(page)
        first = next(s for s in sections if s['text'] == 'First cell')
        self.assertTrue(any(s['text'] == 'Second cell' for s in sections))
        edit_section(self.pdf.doc, 0, first, 'Few')
        self.assertIn('Second cell', self.pdf.doc[0].get_text())

    def test_narrow_box_grows_in_free_space_at_original_size(self):
        section = text_sections(self.pdf.doc[0])[0]
        target = fitz.Rect(section['rect'])
        target.x1 = target.x0 + 85
        target.y1 = target.y0 + 5
        count = edit_section(self.pdf.doc, 0, section, 'Few words here', target)
        self.assertGreater(count, 1)
        updated = next(s for s in text_sections(self.pdf.doc[0]) if 'Few' in s['text'])
        self.assertEqual(updated['style']['size'], section['style']['size'])

    def test_existing_text_moves_without_duplicate_or_white_patch(self):
        section = text_sections(self.pdf.doc[0])[0]
        target = fitz.Rect(section['rect']) + (120, 50, 120, 50)
        edit_section(self.pdf.doc, 0, section, section['text'], target)
        matches = self.pdf.doc[0].search_for('Editable paragraph')
        self.assertEqual(len(matches), 1)
        self.assertAlmostEqual(matches[0].x0, target.x0, places=3)
        self.assertAlmostEqual(matches[0].y0, target.y0, places=3)
        self.assertEqual(self.pdf.doc[0].get_pixmap().pixel(60, 95), (25, 38, 51))

    def test_internal_blank_line_removal_moves_next_line_up(self):
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, 'First\n\nSecond\n')
        first, second = [self.pdf.doc[0].search_for(t)[0] for t in ('First', 'Second')]
        self.assertAlmostEqual(second.y0 - first.y0, section['line_height'], places=3)
