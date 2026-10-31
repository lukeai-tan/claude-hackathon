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

    def test_neighbour_collision_rejected(self):
        section = text_sections(self.pdf.doc[0])[0]
        rect = fitz.Rect(section['rect'])
        rect.y1 = 400
        with self.assertRaisesRegex(ValueError, 'overlap'):
            edit_section(self.pdf.doc, 0, section, 'line\n' * 6 + 'collision', rect)

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
