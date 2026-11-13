import os
import tempfile
import unittest
from pathlib import Path
import fitz
import versions


def make_pdf(pages=1, text='v1'):
    doc = fitz.open()
    for _ in range(pages):
        doc.new_page().insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


class VersionHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['OPENPDF_HISTORY_DIR'] = str(Path(self.tmp.name) / 'history')
        self.doc_path = str(Path(self.tmp.name) / 'report.pdf')
        Path(self.doc_path).write_bytes(make_pdf())

    def tearDown(self):
        os.environ.pop('OPENPDF_HISTORY_DIR', None)
        self.tmp.cleanup()

    def test_save_list_read_round_trip(self):
        self.assertEqual(versions.list_versions(self.doc_path), [])
        data = make_pdf(pages=2, text='snapshot')
        record = versions.save_version(self.doc_path, data, 'First draft')
        self.assertEqual(record['label'], 'First draft')
        self.assertEqual(record['pages'], 2)
        listed = versions.list_versions(self.doc_path)
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]['id'], record['id'])
        self.assertEqual(versions.read_version(self.doc_path, record['id']), data)

    def test_versions_are_sorted_newest_first(self):
        a = versions.save_version(self.doc_path, make_pdf(), 'A')
        b = versions.save_version(self.doc_path, make_pdf(), 'B')
        ids = [r['id'] for r in versions.list_versions(self.doc_path)]
        self.assertEqual(ids, [b['id'], a['id']])

    def test_delete_removes_file_and_index_entry(self):
        record = versions.save_version(self.doc_path, make_pdf(), 'temp')
        versions.delete_version(self.doc_path, record['id'])
        self.assertEqual(versions.list_versions(self.doc_path), [])
        self.assertFalse(versions.version_file(self.doc_path, record['id']).exists())
        with self.assertRaises(ValueError):
            versions.read_version(self.doc_path, record['id'])

    def test_history_is_isolated_per_document(self):
        other = str(Path(self.tmp.name) / 'other.pdf')
        Path(other).write_bytes(make_pdf())
        versions.save_version(self.doc_path, make_pdf(), 'mine')
        self.assertEqual(versions.list_versions(other), [])

    def test_empty_snapshot_rejected(self):
        with self.assertRaises(ValueError):
            versions.save_version(self.doc_path, b'')

    def test_index_survives_missing_snapshot_file(self):
        record = versions.save_version(self.doc_path, make_pdf(), 'gone')
        versions.version_file(self.doc_path, record['id']).unlink()  # file vanished
        self.assertEqual(versions.list_versions(self.doc_path), [])  # not listed, no crash


if __name__ == '__main__':
    unittest.main()
