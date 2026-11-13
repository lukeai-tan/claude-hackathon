"""Persistent local version history for PDF documents, keyed by file path.

Snapshots live under a per-user directory (never next to the document and never
uploaded). Each tracked document gets a folder named from a hash of its absolute
path, holding the snapshot PDFs plus an index.json of metadata.
"""
from pathlib import Path
import hashlib
import json
import os
import time
import uuid

import fitz


def history_root():
    override = os.environ.get('OPENPDF_HISTORY_DIR')
    return Path(override) if override else Path.home() / '.openpdf' / 'history'


def _doc_dir(path):
    key = hashlib.sha256(str(Path(path).resolve()).encode('utf-8')).hexdigest()[:16]
    return history_root() / key


def _index_file(doc_dir):
    return doc_dir / 'index.json'


def _load_index(doc_dir):
    file = _index_file(doc_dir)
    if not file.exists():
        return []
    try:
        data = json.loads(file.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_index(doc_dir, index):
    _index_file(doc_dir).write_text(json.dumps(index, indent=2), encoding='utf-8')


def save_version(path, data, label=''):
    if not data:
        raise ValueError('Nothing to snapshot yet.')
    doc_dir = _doc_dir(path)
    doc_dir.mkdir(parents=True, exist_ok=True)
    version_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    (doc_dir / f'{version_id}.pdf').write_bytes(data)
    try:
        with fitz.open(stream=data, filetype='pdf') as doc:
            pages = len(doc)
    except Exception:
        pages = 0
    record = {'id': version_id, 'created': time.time(), 'label': label.strip(),
              'source': Path(path).name, 'pages': pages, 'bytes': len(data)}
    index = _load_index(doc_dir)
    index.append(record)
    _save_index(doc_dir, index)
    return record


def list_versions(path):
    doc_dir = _doc_dir(path)
    index = _load_index(doc_dir)
    valid = [r for r in index if (doc_dir / f"{r['id']}.pdf").exists()]
    return sorted(valid, key=lambda r: r.get('created', 0), reverse=True)


def version_file(path, version_id):
    return _doc_dir(path) / f'{version_id}.pdf'


def read_version(path, version_id):
    file = version_file(path, version_id)
    if not file.exists():
        raise ValueError('That version is no longer available.')
    return file.read_bytes()


def delete_version(path, version_id):
    doc_dir = _doc_dir(path)
    file = doc_dir / f'{version_id}.pdf'
    if file.exists():
        file.unlink()
    _save_index(doc_dir, [r for r in _load_index(doc_dir) if r['id'] != version_id])
