"""Local PDF operations. Coordinates are PDF points in unrotated page space."""
from pathlib import Path
import datetime
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
from rich_boxes import apply_redactions


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
        # Undo/preview snapshots are transient. Expensive garbage collection and
        # compression belong to Save as, not every mouse gesture or edit.
        return self.doc.tobytes(garbage=0, deflate=False)

    def restore(self, data):
        self.doc.close()
        self.doc = fitz.open(stream=data, filetype='pdf')

    # User-facing permission groups; each maps to the low-level PDF_PERM_* flags
    # that a password-protected export grants to whoever opens with the password.
    PERMISSIONS = [
        ('print', 'Allow printing', fitz.PDF_PERM_PRINT | fitz.PDF_PERM_PRINT_HQ),
        ('copy', 'Allow copying text and images', fitz.PDF_PERM_COPY | fitz.PDF_PERM_ACCESSIBILITY),
        ('modify', 'Allow editing the content', fitz.PDF_PERM_MODIFY | fitz.PDF_PERM_ASSEMBLE),
        ('annotate', 'Allow comments and markup', fitz.PDF_PERM_ANNOTATE),
        ('forms', 'Allow filling form fields', fitz.PDF_PERM_FORM),
    ]

    @staticmethod
    def permission_mask(allowed_keys):
        allowed = set(allowed_keys)
        mask = 0
        for key, _label, flags in PDF.PERMISSIONS:
            if key in allowed:
                mask |= flags
        return mask

    def save(self, path, password='', owner_password='', permissions=None):
        options = dict(garbage=4, deflate=True)
        if password:
            if permissions is None:  # no restrictions chosen: grant everything
                permissions = self.permission_mask(key for key, _label, _flags in self.PERMISSIONS)
            options.update(encryption=fitz.PDF_ENCRYPT_AES_256,
                           user_pw=password, owner_pw=owner_password or password,
                           permissions=permissions)
        self._atomic_write(path, self.doc.tobytes(**options))

    @staticmethod
    def _atomic_write(path, data):
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

    def current_size(self):
        return len(self.doc.tobytes(garbage=4, deflate=True))

    def optimized_bytes(self, dpi=120, quality=70, downsample_images=True,
                        subset_fonts=True, strip_metadata=False):
        # Work on a copy so the open document is never mutated by optimization.
        work = fitz.open('pdf', self.doc.tobytes())
        try:
            if strip_metadata:
                work.set_metadata({})
                work.del_xml_metadata()
            if downsample_images:
                # Downsample images meaningfully above the target DPI (Acrobat uses
                # a ~1.5x threshold) down to it, re-encoding at the chosen quality.
                work.rewrite_images(dpi_threshold=max(dpi + 1, round(dpi * 1.5)), dpi_target=dpi,
                                    quality=quality, lossy=True, lossless=True)
            if subset_fonts:
                try:
                    work.subset_fonts()
                except Exception:
                    pass  # subsetting can fail on unusual fonts; skip rather than abort
            return work.tobytes(garbage=4, deflate=True, clean=True)
        finally:
            work.close()

    def optimize(self, path, **options):
        data = self.optimized_bytes(**options)
        self._atomic_write(path, data)
        return len(data)

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
        apply_redactions(page, images=0, graphics=0)
        for rect in boxes:
            self.insert_text(index, rect, new, size)
        return len(boxes)

    def redact(self, index, rect):
        page = self.doc[index]
        page.add_redact_annot(rect, fill=(0, 0, 0))
        apply_redactions(page, images=2, graphics=2, text=0)

    def sanitize(self):
        self.doc.set_metadata({})
        self.doc.del_xml_metadata()
        for name in self.doc.embfile_names():
            self.doc.embfile_del(name)

    @staticmethod
    def create_signing_id(path, common_name, password, organization='', days=3650):
        # Generate a self-signed digital ID (key + certificate) as a PKCS#12 file.
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives.serialization import pkcs12
        if not common_name.strip():
            raise ValueError('Enter a name for the digital ID.')
        if not password:
            raise ValueError('Set a password to protect the digital ID.')
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        attributes = [x509.NameAttribute(NameOID.COMMON_NAME, common_name.strip())]
        if organization.strip():
            attributes.append(x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization.strip()))
        name = x509.Name(attributes)
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=days))
                .sign(key, hashes.SHA256()))
        data = pkcs12.serialize_key_and_certificates(
            common_name.strip().encode()[:30] or b'OpenPDF ID', key, cert, None,
            serialization.BestAvailableEncryption(password.encode()))
        Path(path).write_bytes(data)

    def is_signed(self):
        # True if the document carries an applied certificate signature. Editing
        # and re-saving in OpenPDF rewrites the file and would remove it.
        for page in self.doc:
            for widget in (page.widgets() or []):
                if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE and getattr(widget, 'is_signed', False):
                    return True
        return False

    def sign(self, output_path, pkcs12_path, password, field_name='Signature1', reason='', location=''):
        from pyhanko.sign import signers
        from pyhanko.sign.signers import SimpleSigner
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        try:
            signer = SimpleSigner.load_pkcs12(pkcs12_path, passphrase=password.encode())
        except Exception:
            raise ValueError('Could not open the digital ID. Check the file and password.') from None
        if signer is None:
            raise ValueError('Could not open the digital ID. Check the file and password.')
        meta = signers.PdfSignatureMetadata(field_name=field_name or 'Signature1',
                                            reason=reason or None, location=location or None)
        writer = IncrementalPdfFileWriter(io.BytesIO(self.doc.tobytes()))
        signed = signers.sign_pdf(writer, meta, signer=signer, existing_fields_only=False)
        self._atomic_write(output_path, signed.getvalue())

    @staticmethod
    def verify_signatures(data):
        # Verify the raw signed bytes directly: re-serializing through the editor
        # would change the file and break every signature's byte range. Reports
        # integrity and signer; trust (chain to a CA) is not asserted, so
        # self-signed IDs read as valid-but-untrusted.
        import logging
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko.sign.validation.status import SignatureCoverageLevel
        from pyhanko_certvalidator import ValidationContext
        # Self-signed IDs can't chain to a CA; that's expected here, so keep the
        # library's trust-path failures out of the console.
        for logger in ('pyhanko', 'pyhanko_certvalidator'):
            logging.getLogger(logger).setLevel(logging.CRITICAL)
        context = ValidationContext(trust_roots=[], allow_fetching=False)
        results = []
        reader = PdfFileReader(io.BytesIO(data))
        for sig in reader.embedded_signatures:
            try:
                status = validate_pdf_signature(sig, context)
                signer = status.signing_cert.subject.native.get('common_name', 'Unknown')
                # "Unmodified" means the signed bytes are intact AND nothing was
                # appended after signing (an incremental edit lowers the coverage).
                unmodified = bool(status.intact) and status.coverage == SignatureCoverageLevel.ENTIRE_FILE
                results.append({'field': sig.field_name, 'signer': signer,
                                'intact': unmodified, 'valid': bool(status.valid)})
            except Exception as error:
                results.append({'field': getattr(sig, 'field_name', '?'), 'signer': 'Unknown',
                                'intact': False, 'valid': False, 'error': str(error)})
        return results

    def add_image(self, index, rect, path):
        self.doc[index].insert_image(rect, filename=str(path), keep_proportion=True)

    def highlight(self, index, text):
        page = self.doc[index]
        boxes = page.search_for(text, quads=True)
        if not boxes:
            raise ValueError('No matching text on this page.')
        page.add_highlight_annot(boxes)
        return len(boxes)

    # Text-markup annotations draw over selected character quads.
    MARKUP = {'highlight': 'add_highlight_annot', 'strikeout': 'add_strikeout_annot',
              'underline': 'add_underline_annot', 'squiggly': 'add_squiggly_annot'}

    def markup(self, index, quads, kind, author='OpenPDF'):
        method = self.MARKUP.get(kind)
        if not method:
            raise ValueError('Unknown markup type.')
        if not quads:
            raise ValueError('Select text first, then choose a markup.')
        page = self.doc[index]  # keep the page alive so annot.update() can reach it
        annot = getattr(page, method)(quads)
        annot.set_info(title=author)
        annot.update()
        return annot

    def note(self, index, point, text, author='OpenPDF'):
        if not text.strip():
            raise ValueError('Enter note text.')
        page = self.doc[index]
        annot = page.add_text_annot(point, text)
        annot.set_info(title=author)
        annot.update()
        return annot

    def callout(self, index, rect, text, author='OpenPDF', size=11):
        if not text.strip():
            raise ValueError('Enter callout text.')
        page = self.doc[index]
        annot = page.add_freetext_annot(rect, text, fontsize=size)
        annot.set_info(title=author)
        annot.update()
        return annot

    def shape(self, index, kind, rect, color=(0.16, 0.16, 0.55), width=1.5, author='OpenPDF'):
        page = self.doc[index]
        if kind in ('line', 'arrow'):
            annot = page.add_line_annot(rect.tl, rect.br)
            if kind == 'arrow':
                annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_OPEN_ARROW)
        elif kind == 'rectangle':
            annot = page.add_rect_annot(rect)
        elif kind == 'oval':
            annot = page.add_circle_annot(rect)
        else:
            raise ValueError('Unknown shape type.')
        annot.set_colors(stroke=color)
        annot.set_border(width=width)
        annot.set_info(title=author)
        annot.update()
        return annot

    # Adobe-style rubber stamps; id maps to fitz.STAMP_* (0 = Approved).
    STAMPS = ['Approved', 'AsIs', 'Confidential', 'Departmental', 'Experimental',
              'Expired', 'Final', 'ForComment', 'ForPublicRelease', 'NotApproved',
              'NotForPublicRelease', 'Sold', 'TopSecret', 'Draft']

    def stamp(self, index, rect, stamp_id, author='OpenPDF'):
        if not 0 <= stamp_id < len(self.STAMPS):
            raise ValueError('Unknown stamp.')
        page = self.doc[index]
        annot = page.add_stamp_annot(rect, stamp=stamp_id)
        annot.set_info(title=author)
        annot.update()
        return annot

    def annotations(self):
        # Every markup/shape/note/stamp/ink annotation across the document.
        items = []
        for index in range(len(self.doc)):
            page = self.doc[index]  # hold the page; annots die with their parent
            for annot in page.annots():
                info = annot.info
                items.append({'page': index, 'kind': annot.type[1],
                              'text': info.get('content', '') or '',
                              'author': info.get('title', '') or '',
                              'rect': tuple(annot.rect), 'xref': annot.xref})
        return items

    def delete_annotation(self, index, xref):
        page = self.doc[index]
        for annot in page.annots():
            if annot.xref == xref:
                page.delete_annot(annot)
                return True
        return False

    # Supported interactive field types. Radio groups need a parent-field
    # structure PyMuPDF's add_widget does not build, so they are not offered yet.
    FIELD_TYPES = {
        'text': fitz.PDF_WIDGET_TYPE_TEXT,
        'checkbox': fitz.PDF_WIDGET_TYPE_CHECKBOX,
        'dropdown': fitz.PDF_WIDGET_TYPE_COMBOBOX,
        'listbox': fitz.PDF_WIDGET_TYPE_LISTBOX,
        'signature': fitz.PDF_WIDGET_TYPE_SIGNATURE,
    }

    def add_field(self, index, rect, name, kind='text', choices=None):
        if not name.strip():
            raise ValueError('A field name is required.')
        widget_type = self.FIELD_TYPES.get(kind)
        if widget_type is None:
            raise ValueError('Unsupported field type.')
        if any(w.field_name == name for p in self.doc for w in (p.widgets() or [])):
            raise ValueError('Field names must be unique.')
        widget = fitz.Widget()
        widget.field_name = name
        widget.field_type = widget_type
        widget.rect = rect
        widget.border_width = 1
        widget.border_color = (0.3, 0.5, 0.7)
        widget.text_fontsize = 12
        if kind == 'checkbox':
            widget.field_value = 'Off'
        elif kind in ('dropdown', 'listbox'):
            options = [c for c in (choices or []) if c]
            if not options:
                raise ValueError('Provide at least one option for a dropdown or list box.')
            widget.choice_values = options
            widget.field_value = options[0]
        elif kind == 'text':
            widget.field_value = ''
        self.doc[index].add_widget(widget)

    def fields(self):
        return [(i, w.field_name, w.field_value, w.field_type, list(w.choice_values or []))
                for i, p in enumerate(self.doc) for w in (p.widgets() or [])]

    def fill_field(self, index, name, value):
        for w in self.doc[index].widgets() or []:
            if w.field_name == name:
                if w.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                    w.field_value = w.on_state() if str(value).lower() in ('yes', 'true', '1', 'on') else 'Off'
                elif w.field_type == fitz.PDF_WIDGET_TYPE_TEXT:
                    w.field_value = value
                elif w.field_type in (fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.PDF_WIDGET_TYPE_LISTBOX):
                    options = w.choice_values or []
                    if value and options and value not in options:
                        raise ValueError(f'{value!r} is not one of: {", ".join(options)}')
                    w.field_value = value
                else:
                    raise ValueError('This field type cannot be filled here.')
                w.update()
                return
        raise ValueError('Field not found.')

    _XFDF_NS = 'http://ns.adobe.com/xfdf/'

    def export_form_data(self, path):
        # Write field values as XFDF so a filled form's answers can be reused.
        import xml.etree.ElementTree as ET
        ns = self._XFDF_NS
        ET.register_namespace('', ns)
        root = ET.Element(f'{{{ns}}}xfdf')
        container = ET.SubElement(root, f'{{{ns}}}fields')
        count = 0
        for page in self.doc:
            for w in (page.widgets() or []):
                if w.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                    continue
                field = ET.SubElement(container, f'{{{ns}}}field')
                field.set('name', w.field_name)
                value = ET.SubElement(field, f'{{{ns}}}value')
                value.text = '' if w.field_value is None else str(w.field_value)
                count += 1
        ET.ElementTree(root).write(str(path), encoding='utf-8', xml_declaration=True)
        return count

    def import_form_data(self, path):
        # Accept XFDF from OpenPDF or Acrobat (namespaced or not) and apply by name.
        import xml.etree.ElementTree as ET
        local = lambda tag: tag.rsplit('}', 1)[-1]
        tree = ET.parse(str(path))  # local, user-selected file
        values = {}
        for element in tree.iter():
            if local(element.tag) == 'field' and element.get('name'):
                value_el = next((c for c in element if local(c.tag) == 'value'), None)
                values[element.get('name')] = (value_el.text or '') if value_el is not None else ''
        applied = 0
        for page in self.doc:
            for w in (page.widgets() or []):
                if w.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE or w.field_name not in values:
                    continue
                val = values[w.field_name]
                if w.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                    w.field_value = w.on_state() if val not in ('', 'Off', 'off') else 'Off'
                else:
                    w.field_value = val
                w.update()
                applied += 1
        return applied

    def watermark(self, text, **options):
        from watermark_tools import add_watermarks
        add_watermarks(self.doc, text, **options)

    def number_pages(self):
        for i, page in enumerate(self.doc):
            page.insert_text((page.rect.width / 2, page.rect.height - 20),
                             f'{i + 1} / {len(self.doc)}', fontsize=10)

    # Header/footer slots; templates may contain <page> <pages> <date> <filename>.
    HEADER_FOOTER_SLOTS = ['header-left', 'header-center', 'header-right',
                           'footer-left', 'footer-center', 'footer-right']

    def _range(self, first, last):
        total = len(self.doc)
        first = 0 if first is None else max(0, first)
        last = total - 1 if last is None else min(total - 1, last)
        return first, last

    def _place(self, page, text, band, align, size, color, font, margin):
        width = fitz.get_text_length(text, fontname=font, fontsize=size)
        if align == 'left':
            x = margin
        elif align == 'right':
            x = page.rect.width - margin - width
        else:
            x = (page.rect.width - width) / 2
        y = margin if band in ('header', 'top') else page.rect.height - margin
        page.insert_text((x, y), text, fontsize=size, fontname=font, color=color)

    def apply_header_footer(self, slots, filename='', size=10, color=(0, 0, 0),
                            font='helv', margin=36, first=None, last=None):
        if not any((slots.get(k) or '').strip() for k in self.HEADER_FOOTER_SLOTS):
            raise ValueError('Enter text for at least one header or footer position.')
        first, last = self._range(first, last)
        total = len(self.doc)
        today = datetime.date.today().isoformat()
        def expand(template, index):
            return (template.replace('<page>', str(index + 1)).replace('<pages>', str(total))
                            .replace('<date>', today).replace('<filename>', filename))
        for index in range(first, last + 1):
            page = self.doc[index]
            for slot in self.HEADER_FOOTER_SLOTS:
                template = (slots.get(slot) or '').strip()
                if not template:
                    continue
                band, align = slot.split('-')
                self._place(page, expand(template, index), band, align, size, color, font, margin)
        return last - first + 1

    BATES_POSITIONS = ['bottom-right', 'bottom-center', 'bottom-left',
                       'top-right', 'top-center', 'top-left']

    def bates_number(self, prefix='', suffix='', start=1, digits=6, position='bottom-right',
                     size=10, color=(0, 0, 0), font='helv', margin=36, first=None, last=None):
        if digits < 1:
            raise ValueError('Use at least one digit.')
        if position not in self.BATES_POSITIONS:
            raise ValueError('Unknown Bates position.')
        first, last = self._range(first, last)
        band, align = position.split('-')
        counter = start
        for index in range(first, last + 1):
            label = f'{prefix}{counter:0{digits}d}{suffix}'
            counter += 1
            self._place(self.doc[index], label, band, align, size, color, font, margin)
        return counter  # next number, for continuing the sequence across documents

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
                hint = ('Use the bundled Windows release or install Tesseract.' if os.name == 'nt'
                        else 'Install it with your package manager, e.g. sudo apt install tesseract-ocr.')
                raise ValueError('Tesseract is missing. ' + hint)
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

