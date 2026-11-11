import tempfile
import unittest
from pathlib import Path
import fitz
from core import PDF


class PermissionTests(unittest.TestCase):
    def setUp(self):
        self.pdf = PDF()
        self.pdf.doc.new_page().insert_text((72, 72), 'confidential content')

    def tearDown(self):
        self.pdf.close()

    def export(self, folder, **kwargs):
        path = Path(folder) / 'protected.pdf'
        self.pdf.save(path, **kwargs)
        return path

    def test_mask_includes_only_selected_groups(self):
        mask = PDF.permission_mask(['print', 'copy'])
        self.assertTrue(mask & fitz.PDF_PERM_PRINT)
        self.assertTrue(mask & fitz.PDF_PERM_COPY)
        self.assertFalse(mask & fitz.PDF_PERM_MODIFY)
        self.assertFalse(mask & fitz.PDF_PERM_ANNOTATE)
        self.assertFalse(mask & fitz.PDF_PERM_FORM)

    def test_restricted_export_clears_denied_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            # Deny printing and editing; allow copy/annotate/forms.
            mask = PDF.permission_mask(['copy', 'annotate', 'forms'])
            path = self.export(folder, password='open', owner_password='owner', permissions=mask)
            reopened = fitz.open(path)
            self.assertEqual(reopened.needs_pass, 1)
            self.assertTrue(reopened.authenticate('open'))
            self.assertFalse(reopened.permissions & fitz.PDF_PERM_PRINT, 'Printing should be denied')
            self.assertFalse(reopened.permissions & fitz.PDF_PERM_MODIFY, 'Editing should be denied')
            self.assertTrue(reopened.permissions & fitz.PDF_PERM_COPY, 'Copying should be allowed')
            self.assertTrue(reopened.permissions & fitz.PDF_PERM_ANNOTATE, 'Annotating should be allowed')
            reopened.close()

    def test_unprotected_export_has_no_encryption(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'plain.pdf'
            self.pdf.save(path)
            reopened = fitz.open(path)
            self.assertEqual(reopened.needs_pass, 0)
            reopened.close()

    def test_password_without_permissions_allows_everything(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.export(folder, password='open', owner_password='owner')
            reopened = fitz.open(path)
            reopened.authenticate('open')
            for flag in (fitz.PDF_PERM_PRINT, fitz.PDF_PERM_COPY, fitz.PDF_PERM_MODIFY,
                         fitz.PDF_PERM_ANNOTATE, fitz.PDF_PERM_FORM):
                self.assertTrue(reopened.permissions & flag)
            reopened.close()


if __name__ == '__main__':
    unittest.main()
