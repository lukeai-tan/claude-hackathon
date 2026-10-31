import unittest
import fitz
from core import PDF
from text_tools import find_matches, replace_match, select_text


class TextToolsTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        p = self.pdf.doc.new_page()
        p.draw_rect(p.rect, color=None, fill=(0.1, 0.15, 0.2))
        p.insert_text((50, 100), 'problem first and problem second', fontname='hebo', fontsize=18, color=(0.8, 0.9, 0.7))
        p.insert_text((50, 140), 'third line problem', fontname='heit', fontsize=12, color=(1, 1, 1))

    def tearDown(self):
        self.pdf.close()

    def test_replace_one_preserves_style_and_background(self):
        matches = find_matches(self.pdf.doc, 'problem')
        self.assertEqual(len(matches), 3)
        p = self.pdf.doc[0]
        before = p.get_pixmap()
        replace_match(self.pdf.doc, matches[1], 'fixed')
        p = self.pdf.doc[0]
        self.assertEqual(len(p.search_for('problem')), 2)
        self.assertEqual(len(p.search_for('fixed')), 1)
        spans = [s for b in p.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans']]
        fixed = next(s for s in spans if s['text'] == 'fixed')
        original = matches[1]['style']
        for prop in ('font', 'size', 'color'):
            self.assertEqual(fixed[prop], original[prop])
        self.assertAlmostEqual(fixed['origin'][1], matches[1]['origin'][1])
        after = p.get_pixmap()
        r = fitz.Rect(matches[1]['rect'])
        # Below the baseline inside the old redaction box remains dark.
        x, y = int(r.x1 - 2), int(r.y1 - 2)
        self.assertEqual(before.pixel(x, y), after.pixel(x, y))

    def test_too_long_is_rejected_before_mutation(self):
        match = find_matches(self.pdf.doc, 'problem')[0]
        original = self.pdf.doc[0].get_pixmap().samples
        original_text = self.pdf.doc[0].get_text()
        with self.assertRaises(ValueError):
            replace_match(self.pdf.doc, match, 'this replacement is far too long to fit')
        self.assertEqual(self.pdf.doc[0].get_pixmap().samples, original)
        self.assertEqual(self.pdf.doc[0].get_text(), original_text)

    def test_highlight_only_selected_occurrence(self):
        p = self.pdf.doc[0]
        matches = find_matches(self.pdf.doc, 'problem')
        r = fitz.Rect(matches[1]['rect'])
        quads, text = select_text(p, (r.x0 + 1, r.y0 + 2), (r.x1 - 1, r.y0 + 2))
        self.assertEqual(text, 'problem')
        p.add_highlight_annot(quads)
        annots = list(p.annots())
        self.assertEqual(len(annots), 1)
        self.assertEqual(len(annots[0].vertices), 4)
        self.assertFalse(annots[0].rect.intersects(fitz.Rect(matches[0]['rect'])))

    def test_multiline_selection(self):
        p = self.pdf.doc[0]
        a = p.search_for('second')[0]
        b = p.search_for('third')[0]
        quads, text = select_text(p, (a.x0 + 1, a.y0 + 2), (b.x1 - 1, b.y0 + 2))
        self.assertEqual(text, 'second\nthird')
        self.assertEqual(len(quads), 2)

    def test_find_across_pages_and_case(self):
        self.pdf.doc.new_page().insert_text((20, 50), 'PROBLEM')
        self.assertEqual([m['page'] for m in find_matches(self.pdf.doc, 'problem')], [0, 0, 0, 1])

    def test_delete_match_keeps_other_occurrences(self):
        replace_match(self.pdf.doc, find_matches(self.pdf.doc, 'problem')[1], '')
        self.assertEqual(len(self.pdf.doc[0].search_for('problem')), 2)
