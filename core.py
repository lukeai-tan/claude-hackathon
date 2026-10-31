"""Local PDF operations. Coordinates are PDF points in unrotated page space."""
from pathlib import Path
import difflib
import html
import io
import os
import shutil
import subprocess
import sys
import tempfile

import fitz
from PIL import Image
from text_tools import find_matches, replace_match, select_text


def page_numbers(spec, count):
    result = []
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = map(int, part.split('-', 1))
            result.extend(range(a - 1, b, 1) if a <= b else range(a - 1, b - 2, -1))
        else:
            result.append(int(part) - 1)
    if not result or any(p < 0 or p >= count for p in result):
        raise ValueError(f'Enter pages between 1 and {count}, e.g. 1,3-5.')
    return result


class PDF:
    def __init__(self, path=None, password=''):
        self.doc = fitz.open(path) if path else fitz.open()
        if self.doc.needs_pass and not self.doc.authenticate(password):
            self.doc.close()
            raise ValueError('Incorrect password.')
        if path and not self.doc.is_pdf:
            data = self.doc.convert_to_pdf()
            self.doc.close()
            self.doc = fitz.open(stream=data, filetype='pdf')

    def close(self):
        self.doc.close()

    def bytes(self):
        return self.doc.tobytes(garbage=4, deflate=True)

    def restore(self, data):
        self.doc.close()
        self.doc = fitz.open(stream=data, filetype='pdf')

    def save(self, path, password='', owner_password=''):
        options = dict(garbage=4, deflate=True)
        if password:
            options.update(encryption=fitz.PDF_ENCRYPT_AES_256,
                           user_pw=password, owner_pw=owner_password or password,
                           permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY |
                           fitz.PDF_PERM_ANNOTATE | fitz.PDF_PERM_MODIFY)
        data = self.doc.tobytes(**options)
        # Atomic replacement avoids truncating a source PDF that is still open.
        target = Path(path)
        fd, tmp = tempfile.mkstemp(dir=target.parent, suffix='.pdf')
        try:
            with os.fdopen(fd, 'wb') as handle:
                handle.write(data)
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def merge(self, paths):
        for path in paths:
            source = PDF(path)
            try:
                self.doc.insert_pdf(source.doc)
            finally:
                source.close()

    def select(self, spec):
        self.doc.select(page_numbers(spec, len(self.doc)))

    def split(self, folder):
        for index in range(len(self.doc)):
            out = fitz.open()
            out.insert_pdf(self.doc, from_page=index, to_page=index)
            out.save(str(Path(folder) / f'page-{index + 1:04d}.pdf'))
            out.close()

    def insert_text(self, index, rect, text, size=12):
        page = self.doc[index]
        # Shape commits only if all text fits, preventing partial silent exports.
        shape = page.new_shape()
        remaining = shape.insert_textbox(rect, text, fontsize=size, fontname='helv')
        if remaining < 0:
            raise ValueError('Text does not fit. Select a larger area or reduce font size.')
        shape.commit()

    def replace_text(self, index, old, new, size=12):
        page = self.doc[index]
        boxes = page.search_for(old)
        if not boxes:
            raise ValueError('Text not found on this page.')
        # Preflight every replacement before deleting any original text.
        for rect in boxes:
            trial = page.new_shape()
            if trial.insert_textbox(rect, new, fontsize=size, fontname='helv') < 0:
                raise ValueError('Replacement does not fit the original area. Use a smaller font.')
        for rect in boxes:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions(images=0, graphics=0)
        for rect in boxes:
            self.insert_text(index, rect, new, size)
        return len(boxes)

    def redact(self, index, rect):
        page = self.doc[index]
        page.add_redact_annot(rect, fill=(0, 0, 0))
        page.apply_redactions(images=2, graphics=2, text=0)

    def sanitize(self):
        self.doc.set_metadata({})
        self.doc.del_xml_metadata()
        for name in self.doc.embfile_names():
            self.doc.embfile_del(name)

    def add_image(self, index, rect, path):
        self.doc[index].insert_image(rect, filename=str(path), keep_proportion=True)

    def highlight(self, index, text):
        page = self.doc[index]
        boxes = page.search_for(text, quads=True)
        if not boxes:
            raise ValueError('No matching text on this page.')
        page.add_highlight_annot(boxes)
        return len(boxes)

    def add_field(self, index, rect, name, checkbox=False):
        if not name.strip():
            raise ValueError('A field name is required.')
        if any(w.field_name == name for p in self.doc for w in (p.widgets() or [])):
            raise ValueError('Field names must be unique.')
        widget = fitz.Widget()
        widget.field_name = name
        widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX if checkbox else fitz.PDF_WIDGET_TYPE_TEXT
        widget.rect = rect
        widget.field_value = 'Off' if checkbox else ''
        widget.border_width = 1
        widget.border_color = (0.3, 0.5, 0.7)
        widget.text_fontsize = 12
        self.doc[index].add_widget(widget)

    def fields(self):
        return [(i, w.field_name, w.field_value, w.field_type) for i, p in enumerate(self.doc)
                for w in (p.widgets() or [])]

    def fill_field(self, index, name, value):
        for w in self.doc[index].widgets() or []:
            if w.field_name == name:
                if w.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                    w.field_value = w.on_state() if value.lower() in ('yes', 'true', '1', 'on') else 'Off'
                elif w.field_type == fitz.PDF_WIDGET_TYPE_TEXT:
                    w.field_value = value
                else:
                    raise ValueError('This editor supports text and checkbox fields only.')
                w.update()
                return
        raise ValueError('Field not found.')

    def watermark(self, text):
        for page in self.doc:
            page.insert_text((36, 36), text, fontsize=16, color=(0.65, 0.65, 0.65), fill_opacity=0.5)

    def number_pages(self):
        for i, page in enumerate(self.doc):
            page.insert_text((page.rect.width / 2, page.rect.height - 20),
                             f'{i + 1} / {len(self.doc)}', fontsize=10)

    def export_images(self, folder, dpi=144):
        for i, page in enumerate(self.doc):
            page.get_pixmap(dpi=dpi).save(str(Path(folder) / f'page-{i + 1:04d}.png'))

    def export_text(self, path):
        Path(path).write_text('\n\f\n'.join(p.get_text() for p in self.doc), encoding='utf-8')

    def export_docx(self, path):
        """Reconstruct editable paragraphs, runs, tables, images and page layout."""
        from pdf2docx import Converter
        if not any(p.get_text().strip() for p in self.doc):
            raise ValueError('This PDF has no text layer. Run OCR first for editable Word text.')
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.pdf'
            self.save(source)
            converter = Converter(str(source))
            try:
                converter.convert(str(path), multi_processing=False)
            finally:
                converter.close()

    def export_docx_text(self, path):
        from docx import Document
        out = Document()
        for i, page in enumerate(self.doc):
            if i:
                out.add_page_break()
            for block in page.get_text('blocks', sort=True):
                if block[6] == 0:
                    out.add_paragraph(block[4])
        out.save(path)

    def compare(self, other_path, output):
        other = PDF(other_path)
        try:
            left = '\n'.join(p.get_text(sort=True) for p in self.doc).splitlines()
            right = '\n'.join(p.get_text(sort=True) for p in other.doc).splitlines()
            result = difflib.HtmlDiff(wrapcolumn=80).make_file(
                left, right, fromdesc='Current document', todesc=html.escape(Path(other_path).name))
            Path(output).write_text(result, encoding='utf-8')
        finally:
            other.close()

    def ocr(self, indices, language='eng'):
        bundle = Path(getattr(sys, '_MEIPASS', Path(__file__).parent)) / 'tesseract'
        executable = bundle / 'tesseract.exe'
        environment = os.environ.copy()
        if executable.exists():
            environment['TESSDATA_PREFIX'] = str(bundle / 'tessdata')
        else:
            executable = shutil.which('tesseract')
            if not executable:
                raise ValueError('Tesseract is missing. Use the bundled Windows release or install Tesseract.')
        # A complete temporary result prevents partial changes if OCR fails.
        out = fitz.open()
        try:
            for i in range(len(self.doc)):
                if i not in indices:
                    out.insert_pdf(self.doc, from_page=i, to_page=i)
                    continue
                pix = self.doc[i].get_pixmap(dpi=200, alpha=False)
                with tempfile.TemporaryDirectory() as folder:
                    source = Path(folder) / 'scan.png'
                    target = Path(folder) / 'result'
                    pix.save(str(source))
                    result = subprocess.run([str(executable), str(source), str(target), '-l', language, 'pdf'],
                                            capture_output=True, timeout=120, env=environment,
                                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                    if result.returncode:
                        raise ValueError(result.stderr.decode(errors='replace') or 'OCR failed.')
                    data = target.with_suffix('.pdf').read_bytes()
                with fitz.open(stream=data, filetype='pdf') as scanned:
                    out.insert_pdf(scanned)
            self.restore(out.tobytes())
        finally:
            out.close()


def images_to_pdf(paths, output):
    doc = fitz.open()
    try:
        for path in paths:
            with Image.open(path) as image:
                image = image.convert('RGB')
                data = io.BytesIO()
                image.save(data, format='PNG')
                w, h = image.size
            scale = min(595 / w, 842 / h)
            page = doc.new_page(width=w * scale, height=h * scale)
            page.insert_image(page.rect, stream=data.getvalue())
        if not len(doc):
            raise ValueError('Select at least one image.')
        doc.save(output)
    finally:
        doc.close()


def office_to_pdf(path, folder):
    executable = shutil.which('soffice')
    if not executable:
        candidate = Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'LibreOffice/program/soffice.exe'
        executable = str(candidate) if candidate.exists() else None
    if not executable:
        raise ValueError('Office conversion requires LibreOffice installed separately.')
    with tempfile.TemporaryDirectory() as profile:
        result = subprocess.run([executable, '-env:UserInstallation=' + Path(profile).as_uri(),
                                 '--headless', '--convert-to', 'pdf', '--outdir', str(folder), str(path)],
                                capture_output=True, text=True, timeout=120)
    output = Path(folder) / (Path(path).stem + '.pdf')
    if result.returncode or not output.exists():
        raise ValueError(result.stderr or result.stdout or 'Conversion failed.')
    return output
