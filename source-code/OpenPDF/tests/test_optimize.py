import io
import tempfile
import unittest
from pathlib import Path
import fitz
from PIL import Image
from core import PDF


def photo_bytes(w=1600, h=1200):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = ((x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


class OptimizeTests(unittest.TestCase):
    def make_image_pdf(self):
        pdf = PDF()
        page = pdf.doc.new_page(width=600, height=450)
        page.insert_image(fitz.Rect(0, 0, 600, 450), stream=photo_bytes())
        return pdf

    def test_downsampling_reduces_size_without_mutating_source(self):
        pdf = self.make_image_pdf()
        try:
            before = pdf.current_size()
            data = pdf.optimized_bytes(dpi=96, quality=50)
            self.assertLess(len(data), before, 'Optimization did not reduce size')
            # The live document is untouched by producing optimized bytes.
            self.assertEqual(pdf.current_size(), before, 'Source document was mutated')
            reopened = fitz.open('pdf', data)
            self.assertEqual(reopened.page_count, 1)
            reopened.close()
        finally:
            pdf.close()

    def test_optimize_writes_file_and_reports_size(self):
        pdf = self.make_image_pdf()
        try:
            with tempfile.TemporaryDirectory() as folder:
                out = Path(folder) / 'optimized.pdf'
                size = pdf.optimize(out, dpi=96, quality=50)
                self.assertTrue(out.exists())
                self.assertEqual(size, out.stat().st_size)
                with fitz.open(out) as saved:
                    self.assertEqual(saved.page_count, 1)
        finally:
            pdf.close()

    def test_options_can_be_disabled(self):
        pdf = self.make_image_pdf()
        try:
            # Nothing enabled: still valid output, just a plain rewrite.
            data = pdf.optimized_bytes(downsample_images=False, subset_fonts=False, strip_metadata=False)
            self.assertGreater(len(data), 0)
            fitz.open('pdf', data).close()
        finally:
            pdf.close()

    def test_strip_metadata_clears_fields(self):
        pdf = PDF()
        pdf.doc.new_page().insert_text((72, 72), 'hello')
        pdf.doc.set_metadata({'title': 'Secret', 'author': 'Someone'})
        try:
            data = pdf.optimized_bytes(downsample_images=False, subset_fonts=False, strip_metadata=True)
            reopened = fitz.open('pdf', data)
            self.assertFalse(reopened.metadata.get('title'))
            self.assertFalse(reopened.metadata.get('author'))
            reopened.close()
        finally:
            pdf.close()


if __name__ == '__main__':
    unittest.main()
