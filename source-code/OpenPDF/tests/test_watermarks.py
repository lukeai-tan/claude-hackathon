import math
import unittest
import fitz
from core import PDF


class WatermarkTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        self.pdf.doc.new_page(width=500, height=700).insert_text((40, 50), 'Original text')
        self.pdf.doc.new_page(width=700, height=500)

    def tearDown(self):
        self.pdf.close()

    def test_full_page_angle_on_rotated_cropped_pages(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                pdf = PDF()
                try:
                    page = pdf.doc.new_page(width=600, height=800)
                    page.set_cropbox(fitz.Rect(50, 70, 550, 750))
                    page.set_rotation(rotation)
                    pdf.watermark('DRAFT', layout='full-page', angle=45, opacity=.25)
                    pdf.restore(pdf.bytes())
                    page = pdf.doc[0]
                    lines = [line for b in page.get_text('dict')['blocks'] for line in b.get('lines', [])]
                    self.assertEqual(len(lines), 1)
                    line = lines[0]
                    self.assertEqual(''.join(s['text'] for s in line['spans']), 'DRAFT')
                    rect = fitz.Rect(line['bbox']) * page.rotation_matrix
                    self.assertTrue((page.rect + (-1, -1, 1, 1)).contains(rect))
                    self.assertGreater(max(rect.width / page.rect.width, rect.height / page.rect.height), .8)
                    self.assertAlmostEqual((rect.x0 + rect.x1) / 2, page.rect.width / 2, delta=.1)
                    self.assertAlmostEqual((rect.y0 + rect.y1) / 2, page.rect.height / 2, delta=.1)
                    direction = fitz.Point(line['dir']) * fitz.Matrix(rotation)
                    self.assertAlmostEqual(direction.x, math.sqrt(.5), places=4)
                    self.assertAlmostEqual(direction.y, -math.sqrt(.5), places=4)
                    pix = page.get_pixmap()
                    self.assertLess(min(pix.samples), 255, 'Watermark did not render')
                finally:
                    pdf.close()

    def test_tiled_current_page_colour_and_opacity_survive_reopen(self):
        self.pdf.watermark('PRIVATE', layout='tiled', angle=-45, color=(1, 0, 0), opacity=.2, pages=[1])
        self.pdf.restore(self.pdf.bytes())
        self.assertNotIn('PRIVATE', self.pdf.doc[0].get_text())
        page = self.pdf.doc[1]
        self.assertEqual(page.get_text().count('PRIVATE'), 12)
        spans = [s for b in page.get_text('dict')['blocks'] for l in b['lines'] for s in l['spans']]
        self.assertTrue(all(s['color'] == 0xff0000 for s in spans))
        self.assertGreater(min(page.get_pixmap().samples), 150)

    def test_other_layouts_preserve_original_content(self):
        for layout in ('top-left', 'center'):
            self.pdf.watermark('DRAFT', layout=layout)
        self.assertIn('Original text', self.pdf.doc[0].get_text())
        self.assertEqual(self.pdf.doc[0].get_text().count('DRAFT'), 2)

    def test_invalid_options_do_not_partially_modify_pages(self):
        for options in ({'opacity': 0}, {'angle': float('nan')}, {'fontsize': -1},
                        {'pages': [0, 5]}, {'layout': 'unknown'}):
            with self.assertRaises(ValueError):
                self.pdf.watermark('INVALID', **options)
            self.assertNotIn('INVALID', self.pdf.doc[0].get_text())
