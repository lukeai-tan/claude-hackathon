import shutil
import tempfile
import unittest
from pathlib import Path
import fitz
from core import PDF


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.pdf = PDF()
        self.pdf.doc.new_page().insert_text((72, 72), 'Contract to sign')

    def tearDown(self):
        self.pdf.close()
        self.folder.cleanup()

    def make_id(self, name='Ada Lovelace', password='idpw'):
        path = self.root / 'id.p12'
        self.pdf.create_signing_id(path, name, password)
        return path

    def test_create_id_validates_input(self):
        with self.assertRaises(ValueError):
            self.pdf.create_signing_id(self.root / 'x.p12', '  ', 'pw')
        with self.assertRaises(ValueError):
            self.pdf.create_signing_id(self.root / 'x.p12', 'Name', '')
        path = self.make_id()
        self.assertTrue(path.exists() and path.stat().st_size > 0)

    def test_sign_and_verify_round_trip(self):
        pkcs12 = self.make_id(name='Grace Hopper')
        signed = self.root / 'signed.pdf'
        self.pdf.sign(signed, pkcs12, 'idpw', reason='Approved', location='SG')
        self.assertTrue(signed.exists())
        results = PDF.verify_signatures(signed.read_bytes())
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['signer'], 'Grace Hopper')
        self.assertTrue(results[0]['intact'])
        self.assertTrue(results[0]['valid'])
        # the signature is a real widget in the document
        signed_pdf = PDF(signed)
        try:
            self.assertTrue(any(w.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE
                                for w in (signed_pdf.doc[0].widgets() or [])))
        finally:
            signed_pdf.close()

    def test_is_signed_detects_applied_signature(self):
        self.assertFalse(self.pdf.is_signed())
        # an unsigned signature *field* is not a signature
        self.pdf.add_field(0, fitz.Rect(50, 300, 250, 340), 'sig', 'signature')
        self.assertFalse(self.pdf.is_signed())
        pkcs12 = self.make_id()
        signed = self.root / 'signed.pdf'
        self.pdf.sign(signed, pkcs12, 'idpw')
        signed_pdf = PDF(signed)
        try:
            self.assertTrue(signed_pdf.is_signed())
        finally:
            signed_pdf.close()

    def test_wrong_password_is_rejected(self):
        pkcs12 = self.make_id()
        with self.assertRaises(ValueError):
            self.pdf.sign(self.root / 'nope.pdf', pkcs12, 'wrong-password')

    def test_tampering_breaks_integrity(self):
        pkcs12 = self.make_id()
        signed = self.root / 'signed.pdf'
        self.pdf.sign(signed, pkcs12, 'idpw')
        # Incrementally edit after signing (into a copy opened from its own path):
        # the original signed revision stays, but the file now extends past the
        # signed byte range, so integrity must fail.
        out = self.root / 'tampered.pdf'
        shutil.copy(signed, out)
        tampered = fitz.open(out)
        tampered[0].insert_text((72, 200), 'Sneaky addition')
        tampered.save(out, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
        tampered.close()
        results = PDF.verify_signatures(out.read_bytes())
        self.assertEqual(len(results), 1)
        self.assertFalse(results[0]['intact'], 'Post-signing edit should break integrity')


if __name__ == '__main__':
    unittest.main()
