from copy import deepcopy
import unittest
import fitz
from core import PDF
from box_tools import text_sections, edit_section
from text_tools import find_matches, replace_match
from rich_boxes import new_box, put_box, boxes, delete_box, move_page, apply_redactions, DEFAULT_STYLE, fit_box


class RichBoxTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        page = self.pdf.doc.new_page()
        page.draw_rect(page.rect, fill=(.1, .2, .3), color=None)
        page.insert_text((40, 40), 'Existing content')
        self.box = new_box((50, 80, 330, 180))
        self.box['runs'] = [dict(text='Red ', style=dict(DEFAULT_STYLE, color='#ff0000', bold=True)),
                            dict(text='blue text', style=dict(DEFAULT_STYLE, color='#0000ff', italic=True))]

    def tearDown(self):
        self.pdf.close()

    def test_styles_fill_and_editability_survive_save_reopen(self):
        self.box.update(fill='#ffeedd', border='#123456', align='center')
        put_box(self.pdf.doc, 0, self.box)
        self.pdf.restore(self.pdf.bytes())
        saved = boxes(self.pdf.doc[0])[0]
        self.assertEqual(saved['runs'], self.box['runs'])
        self.assertEqual(saved['fill'], '#ffeedd')
        self.assertEqual(self.pdf.doc[0].get_pixmap().pixel(60, 170), (255, 238, 221))
        spans = [s for b in self.pdf.doc[0].get_text('dict')['blocks'] for line in b.get('lines', []) for s in line['spans']]
        self.assertTrue(any(s['color'] == 0xff0000 and 'Bold' in s['font'] for s in spans))
        self.assertTrue(any(s['color'] == 0x0000ff and 'Oblique' in s['font'] for s in spans))
        self.assertEqual(len(find_matches(self.pdf.doc, 'blue text')), 1)

    def test_move_resize_and_delete_preserve_underlying_page(self):
        put_box(self.pdf.doc, 0, self.box)
        old = self.pdf.doc[0].search_for('Red')[0]
        self.box['rect'] = [100, 250, 450, 400]
        put_box(self.pdf.doc, 0, self.box)
        self.assertEqual(len(boxes(self.pdf.doc[0])), 1)
        new = self.pdf.doc[0].search_for('Red')[0]
        self.assertGreater(new.y0, old.y1)
        self.assertEqual(self.pdf.doc[0].get_pixmap().pixel(60, 100), (25, 51, 76))
        delete_box(self.pdf.doc, 0, self.box['id'])
        self.assertEqual(boxes(self.pdf.doc[0]), [])
        self.assertNotIn('blue', self.pdf.doc[0].get_text())
        self.assertIn('Existing', self.pdf.doc[0].get_text())

    def test_transparent_box_does_not_paint_white(self):
        put_box(self.pdf.doc, 0, self.box)
        self.assertEqual(self.pdf.doc[0].get_pixmap().pixel(60, 170), (25, 51, 76))
        self.assertEqual(len(text_sections(self.pdf.doc[0])), 1)

    def test_overflow_is_rejected_without_partial_output(self):
        put_box(self.pdf.doc, 0, self.box)
        before = self.pdf.doc[0].get_text()
        self.box['runs'][0]['text'] = 'overflow ' * 300
        with self.assertRaisesRegex(ValueError, 'height'):
            put_box(self.pdf.doc, 0, self.box)
        self.assertEqual(self.pdf.doc[0].get_text(), before)

    def test_existing_section_edit_keeps_added_box_editable(self):
        put_box(self.pdf.doc, 0, self.box)
        section = text_sections(self.pdf.doc[0])[0]
        edit_section(self.pdf.doc, 0, section, 'Changed')
        self.assertEqual(len(boxes(self.pdf.doc[0])), 1)
        self.assertIn('blue text', self.pdf.doc[0].get_text())

    def test_redacted_box_cannot_restore_old_text_from_metadata(self):
        put_box(self.pdf.doc, 0, self.box)
        page = self.pdf.doc[0]
        page.add_redact_annot(page.search_for('blue')[0], fill=(0, 0, 0))
        apply_redactions(page, text=0, images=0, graphics=0)
        self.pdf.restore(self.pdf.bytes())
        self.assertNotIn('blue', self.pdf.doc[0].get_text())
        self.assertEqual(boxes(self.pdf.doc[0]), [])
        # Metadata with the original text must not survive in exported objects.
        self.assertFalse(any('blue text' in self.pdf.doc.xref_object(i) for i in range(1, self.pdf.doc.xref_length())))

    def test_reorder_forward_backward_preserves_boxes_and_bookmark_target(self):
        put_box(self.pdf.doc, 0, self.box)
        for name in ('Second', 'Third'):
            self.pdf.doc.new_page().insert_text((40, 40), name)
        self.pdf.doc.set_toc([[1, 'Original page', 1]])
        move_page(self.pdf.doc, 0, 2)
        self.assertIn('Second', self.pdf.doc[0].get_text())
        self.assertEqual(len(boxes(self.pdf.doc[2])), 1)
        self.assertEqual(self.pdf.doc.get_toc()[0][2], 3)
        move_page(self.pdf.doc, 2, 0)
        self.assertIn('Existing', self.pdf.doc[0].get_text())
        self.assertEqual(self.pdf.doc.get_toc()[0][2], 1)

    def test_snapshot_undo_redo_preserves_box_metadata(self):
        put_box(self.pdf.doc, 0, self.box)
        before = self.pdf.bytes()
        self.box['fill'] = '#ffffff'
        put_box(self.pdf.doc, 0, self.box)
        after = self.pdf.bytes()
        self.pdf.restore(before)
        self.assertIsNone(boxes(self.pdf.doc[0])[0]['fill'])
        self.pdf.restore(after)
        self.assertEqual(boxes(self.pdf.doc[0])[0]['fill'], '#ffffff')

    def test_tiny_box_grows_to_fit_font_without_reducing_size(self):
        self.box['rect'] = [50, 80, 62, 92]
        self.box['runs'] = [dict(text='Large font\nSecond line', style=dict(DEFAULT_STYLE, size=36))]
        put_box(self.pdf.doc, 0, self.box)
        box = boxes(self.pdf.doc[0])[0]
        self.assertGreater(fitz.Rect(box['rect']).height, 80)
        self.assertGreater(fitz.Rect(box['rect']).width, 100)
        self.assertEqual(box['runs'][0]['style']['size'], 36)
        self.assertIn('Second', self.pdf.doc[0].get_text())

    def test_autosize_at_bottom_shifts_box_up_to_stay_on_page(self):
        self.box['rect'] = [50, 820, 200, 840]
        self.box['runs'] = [dict(text='One\nTwo\nThree', style=dict(DEFAULT_STYLE, size=24))]
        put_box(self.pdf.doc, 0, self.box)
        rect = fitz.Rect(boxes(self.pdf.doc[0])[0]['rect'])
        self.assertLess(rect.y0, 820)
        self.assertLessEqual(rect.y1, self.pdf.doc[0].rect.y1)
        self.assertIn('Three', self.pdf.doc[0].get_text())

    def test_automatic_fit_is_stable_on_repeated_calls(self):
        self.box['rect'] = [50, 80, 70, 100]
        fitted, _ = fit_box(self.box, self.pdf.doc[0].rect)
        again, _ = fit_box(fitted, self.pdf.doc[0].rect)
        self.assertEqual(fitted, again)


if __name__ == '__main__':
    unittest.main()

