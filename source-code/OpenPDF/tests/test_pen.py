import unittest
import fitz
from core import PDF
from pen_tools import add_stroke


class PenTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        self.pdf.doc.new_page(width=400, height=500).insert_text((40, 40), 'Keep this text')

    def tearDown(self):
        self.pdf.close()

    def test_ink_survives_export_with_colour_width_and_points(self):
        points = [(40, 80), (70, 100), (90, 80), (120, 100)]
        add_stroke(self.pdf.doc[0], points, '#008000', 4)
        self.pdf.restore(self.pdf.bytes())
        page = self.pdf.doc[0]
        ink = list(page.annots())[0]
        self.assertEqual(ink.type[0], fitz.PDF_ANNOT_INK)
        self.assertEqual(ink.vertices[0], points)
        self.assertEqual(ink.border['width'], 4)
        self.assertAlmostEqual(ink.colors['stroke'][1], 128 / 255, places=5)
        self.assertTrue(ink.flags & fitz.PDF_ANNOT_IS_PRINT)
        self.assertIn('Keep this text', page.get_text())
        pixel = page.get_pixmap().pixel(70, 100)
        self.assertLess(pixel[0], 50)

    def test_invalid_stroke_does_not_modify_document(self):
        for points, width in [([(10, 10), (500, 30)], 2), ([(10, 10), (30, 30)], 0), ([(float('nan'), 20)], 3)]:
            with self.assertRaises(ValueError):
                add_stroke(self.pdf.doc[0], points, width=width)
            self.assertEqual(list(self.pdf.doc[0].annots() or []), [])

    def test_freehand_highlight_is_translucent_and_printable_after_reopen(self):
        page = self.pdf.doc[0]
        page.draw_rect(fitz.Rect(40, 70, 100, 90), fill=(0, 0, 0), color=None)
        add_stroke(page, [(20, 80), (150, 80)], '#ffff00', 12, highlight=True)
        self.pdf.restore(self.pdf.bytes())
        page = self.pdf.doc[0]
        mark = list(page.annots())[0]
        self.assertAlmostEqual(mark.opacity, .35, places=5)
        self.assertEqual(mark.blendmode, 'Multiply')
        self.assertEqual(mark.border['width'], 12)
        self.assertTrue(mark.flags & fitz.PDF_ANNOT_IS_PRINT)
        self.assertEqual(page.get_pixmap().pixel(60, 80), (0, 0, 0))
        self.assertIn('Keep this text', page.get_text())

    def test_dot_and_rotated_page(self):
        page = self.pdf.doc[0]
        page.set_rotation(90)
        displayed = fitz.Point(100, 200)
        point = displayed * page.derotation_matrix
        add_stroke(page, [tuple(point)], '#0000ff', 6)
        self.pdf.restore(self.pdf.bytes())
        page = self.pdf.doc[0]
        vertex = fitz.Point(list(page.annots())[0].vertices[0][0]) * page.rotation_matrix
        self.assertLess(vertex.distance_to(displayed), .01)
        self.assertLess(page.get_pixmap().pixel(100, 200)[0], 100)
