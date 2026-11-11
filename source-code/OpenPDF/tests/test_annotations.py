import unittest
import fitz
from core import PDF


class AnnotationTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        page = self.pdf.doc.new_page(width=500, height=700)
        page.insert_text((40, 50), 'The quick brown fox jumps')
        self.pdf.doc.new_page(width=500, height=700)

    def tearDown(self):
        self.pdf.close()

    def quads(self, word='quick'):
        return self.pdf.doc[0].search_for(word, quads=True)

    def test_text_markup_kinds_survive_reopen(self):
        for kind, name in [('strikeout', 'StrikeOut'), ('underline', 'Underline'),
                           ('squiggly', 'Squiggly'), ('highlight', 'Highlight')]:
            with self.subTest(kind=kind):
                pdf = PDF()
                try:
                    page = pdf.doc.new_page(width=500, height=700)
                    page.insert_text((40, 50), 'The quick brown fox')
                    pdf.markup(0, page.search_for('quick', quads=True), kind, author='Tester')
                    pdf.restore(pdf.bytes())
                    reopened = pdf.doc[0]
                    annots = list(reopened.annots())
                    self.assertEqual(len(annots), 1)
                    self.assertEqual(annots[0].type[1], name)
                    self.assertEqual(annots[0].info.get('title'), 'Tester')
                finally:
                    pdf.close()

    def test_markup_requires_quads_and_valid_kind(self):
        with self.assertRaises(ValueError):
            self.pdf.markup(0, [], 'strikeout')
        with self.assertRaises(ValueError):
            self.pdf.markup(0, self.quads(), 'nonsense')

    def test_note_and_callout(self):
        self.pdf.note(0, fitz.Point(60, 60), 'A sticky note', author='Tester')
        self.pdf.callout(0, fitz.Rect(100, 200, 300, 260), 'A callout', author='Tester')
        self.pdf.restore(self.pdf.bytes())
        page = self.pdf.doc[0]
        kinds = sorted(a.type[1] for a in page.annots())
        self.assertEqual(kinds, ['FreeText', 'Text'])
        contents = sorted(a.info.get('content', '') for a in page.annots())
        self.assertIn('A sticky note', contents)
        self.assertIn('A callout', contents)

    def test_empty_note_or_callout_rejected(self):
        with self.assertRaises(ValueError):
            self.pdf.note(0, fitz.Point(60, 60), '   ')
        with self.assertRaises(ValueError):
            self.pdf.callout(0, fitz.Rect(100, 200, 300, 260), '')

    def test_shapes_including_arrow(self):
        rect = fitz.Rect(60, 300, 200, 360)
        expected = {'line': 'Line', 'arrow': 'Line', 'rectangle': 'Square', 'oval': 'Circle'}
        for kind, name in expected.items():
            with self.subTest(kind=kind):
                pdf = PDF()
                try:
                    pdf.doc.new_page(width=500, height=700)
                    pdf.shape(0, kind, rect, color=(1, 0, 0), width=2)
                    pdf.restore(pdf.bytes())
                    reopened = pdf.doc[0]
                    annots = list(reopened.annots())
                    self.assertEqual(len(annots), 1)
                    self.assertEqual(annots[0].type[1], name)
                finally:
                    pdf.close()
        with self.assertRaises(ValueError):
            self.pdf.shape(0, 'triangle', rect)

    def test_stamp_label_and_bounds(self):
        self.pdf.stamp(0, fitz.Rect(50, 350, 220, 395), 2, author='Tester')  # Confidential
        self.pdf.restore(self.pdf.bytes())
        page = self.pdf.doc[0]
        annot = next(iter(page.annots()))
        self.assertEqual(annot.type[1], 'Stamp')
        self.assertEqual(annot.info.get('content'), 'Confidential')
        for bad in (-1, len(PDF.STAMPS)):
            with self.assertRaises(ValueError):
                self.pdf.stamp(0, fitz.Rect(50, 350, 220, 395), bad)

    def test_annotations_enumeration_and_delete(self):
        self.pdf.markup(0, self.quads(), 'underline', author='A')
        self.pdf.note(1, fitz.Point(60, 60), 'note on page two', author='B')
        items = self.pdf.annotations()
        self.assertEqual(len(items), 2)
        self.assertEqual({i['page'] for i in items}, {0, 1})
        note = next(i for i in items if i['page'] == 1)
        self.assertEqual(note['text'], 'note on page two')
        self.assertEqual(note['author'], 'B')
        # delete the note, keep the markup
        self.assertTrue(self.pdf.delete_annotation(note['page'], note['xref']))
        self.pdf.restore(self.pdf.bytes())
        remaining = self.pdf.annotations()
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]['kind'], 'Underline')
        # deleting a stale xref is a no-op, not an error
        self.assertFalse(self.pdf.delete_annotation(0, 999999))


if __name__ == '__main__':
    unittest.main()
