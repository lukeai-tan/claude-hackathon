import tempfile
import unittest
from pathlib import Path
import fitz
from core import PDF


class FormFieldTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        self.pdf.doc.new_page(width=400, height=600)

    def tearDown(self):
        self.pdf.close()

    def field_map(self, pdf):
        return {name: (value, kind, choices) for _, name, value, kind, choices in pdf.fields()}

    def test_dropdown_and_listbox_round_trip(self):
        self.pdf.add_field(0, fitz.Rect(50, 50, 250, 80), 'country', 'dropdown', ['USA', 'Canada', 'Singapore'])
        self.pdf.add_field(0, fitz.Rect(50, 100, 250, 180), 'fruit', 'listbox', ['Apple', 'Pear', 'Plum'])
        self.pdf.restore(self.pdf.bytes())
        fields = self.field_map(self.pdf)
        self.assertEqual(fields['country'][1], fitz.PDF_WIDGET_TYPE_COMBOBOX)
        self.assertEqual(fields['country'][2], ['USA', 'Canada', 'Singapore'])
        self.assertEqual(fields['fruit'][1], fitz.PDF_WIDGET_TYPE_LISTBOX)
        self.assertEqual(fields['country'][0], 'USA')  # defaults to first option

    def test_signature_field_created(self):
        self.pdf.add_field(0, fitz.Rect(50, 300, 250, 360), 'approve', 'signature')
        self.pdf.restore(self.pdf.bytes())
        self.assertEqual(self.field_map(self.pdf)['approve'][1], fitz.PDF_WIDGET_TYPE_SIGNATURE)

    def test_choice_validation_and_empty_options(self):
        self.pdf.add_field(0, fitz.Rect(50, 50, 250, 80), 'pick', 'dropdown', ['A', 'B'])
        self.pdf.fill_field(0, 'pick', 'B')
        self.assertEqual(self.field_map(self.pdf)['pick'][0], 'B')
        with self.assertRaises(ValueError):
            self.pdf.fill_field(0, 'pick', 'Z')  # not an allowed option
        with self.assertRaises(ValueError):
            self.pdf.add_field(0, fitz.Rect(50, 200, 250, 230), 'empty', 'listbox', [])
        with self.assertRaises(ValueError):
            self.pdf.add_field(0, fitz.Rect(50, 250, 250, 280), 'bad', 'radio')

    def test_duplicate_name_rejected(self):
        self.pdf.add_field(0, fitz.Rect(50, 50, 250, 80), 'dup', 'text')
        with self.assertRaises(ValueError):
            self.pdf.add_field(0, fitz.Rect(50, 100, 250, 130), 'dup', 'text')

    def test_xfdf_export_import_reapplies_values(self):
        self.pdf.add_field(0, fitz.Rect(50, 50, 250, 80), 'name', 'text')
        self.pdf.add_field(0, fitz.Rect(50, 100, 70, 120), 'agree', 'checkbox')
        self.pdf.add_field(0, fitz.Rect(50, 150, 250, 180), 'country', 'dropdown', ['USA', 'Canada'])
        self.pdf.fill_field(0, 'name', 'Ada')
        self.pdf.fill_field(0, 'agree', 'yes')
        self.pdf.fill_field(0, 'country', 'Canada')
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder) / 'answers.xfdf'
            self.assertEqual(self.pdf.export_form_data(data), 3)

            # A fresh, blank copy of the same form.
            blank = PDF()
            try:
                blank.doc.new_page(width=400, height=600)
                blank.add_field(0, fitz.Rect(50, 50, 250, 80), 'name', 'text')
                blank.add_field(0, fitz.Rect(50, 100, 70, 120), 'agree', 'checkbox')
                blank.add_field(0, fitz.Rect(50, 150, 250, 180), 'country', 'dropdown', ['USA', 'Canada'])
                self.assertEqual(blank.import_form_data(data), 3)
                blank.restore(blank.bytes())
                fields = self.field_map(blank)
                self.assertEqual(fields['name'][0], 'Ada')
                self.assertEqual(fields['country'][0], 'Canada')
                self.assertNotEqual(fields['agree'][0], 'Off')
            finally:
                blank.close()

    def test_imports_namespaced_acrobat_xfdf(self):
        self.pdf.add_field(0, fitz.Rect(50, 50, 250, 80), 'name', 'text')
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder) / 'acrobat.xfdf'
            data.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<xfdf xmlns="http://ns.adobe.com/xfdf/">'
                '<fields><field name="name"><value>Grace</value></field></fields></xfdf>')
            self.assertEqual(self.pdf.import_form_data(data), 1)
            self.assertEqual(self.field_map(self.pdf)['name'][0], 'Grace')


if __name__ == '__main__':
    unittest.main()
