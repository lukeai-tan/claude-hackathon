import datetime
import unittest
import fitz
from core import PDF


class HeaderFooterBatesTests(unittest.TestCase):
    def make(self, pages=3):
        pdf = PDF()
        for _ in range(pages):
            pdf.doc.new_page(width=400, height=600)
        return pdf

    def page_text(self, pdf, index):
        return pdf.doc[index].get_text()

    def test_header_footer_tokens_expand(self):
        pdf = self.make(3)
        try:
            pdf.apply_header_footer({
                'header-left': 'Report',
                'header-right': '<date>',
                'footer-center': 'Page <page> of <pages>',
                'footer-right': '<filename>',
            }, filename='demo.pdf')
            pdf.restore(pdf.bytes())
            first = self.page_text(pdf, 0)
            self.assertIn('Report', first)
            self.assertIn(datetime.date.today().isoformat(), first)
            self.assertIn('Page 1 of 3', first)
            self.assertIn('demo.pdf', first)
            self.assertIn('Page 3 of 3', self.page_text(pdf, 2))
        finally:
            pdf.close()

    def test_header_footer_requires_content_and_respects_range(self):
        pdf = self.make(3)
        try:
            with self.assertRaises(ValueError):
                pdf.apply_header_footer({'header-left': '   '})
            count = pdf.apply_header_footer({'footer-center': 'only here'}, first=1, last=1)
            self.assertEqual(count, 1)
            self.assertNotIn('only here', self.page_text(pdf, 0))
            self.assertIn('only here', self.page_text(pdf, 1))
            self.assertNotIn('only here', self.page_text(pdf, 2))
        finally:
            pdf.close()

    def test_bates_sequence_and_padding(self):
        pdf = self.make(3)
        try:
            next_number = pdf.bates_number(prefix='ACME-', start=1, digits=5)
            pdf.restore(pdf.bytes())
            self.assertIn('ACME-00001', self.page_text(pdf, 0))
            self.assertIn('ACME-00002', self.page_text(pdf, 1))
            self.assertIn('ACME-00003', self.page_text(pdf, 2))
            self.assertEqual(next_number, 4)  # lets the next document continue
        finally:
            pdf.close()

    def test_bates_continues_across_documents(self):
        first = self.make(2)
        second = self.make(2)
        try:
            next_number = first.bates_number(prefix='D', start=1, digits=4)
            second.bates_number(prefix='D', start=next_number, digits=4)
            self.assertIn('D0003', self.page_text(second, 0))
            self.assertIn('D0004', self.page_text(second, 1))
        finally:
            first.close()
            second.close()

    def test_bates_validation(self):
        pdf = self.make(1)
        try:
            with self.assertRaises(ValueError):
                pdf.bates_number(digits=0)
            with self.assertRaises(ValueError):
                pdf.bates_number(position='middle-middle')
        finally:
            pdf.close()


if __name__ == '__main__':
    unittest.main()
