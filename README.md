# OpenPDF Studio

An open-source local Windows PDF workstation built for the claude hackathon.
No subscription, account, document upload, or runtime AI API is required.

## Download

Download `OpenPDF-Studio.exe` from [Releases](https://github.com/RishabhShenoy03/claude-hackathon/releases/latest).
Windows builds run on pushes to master. The executable is also uploaded under
the completed [Build Windows EXE workflow](https://github.com/RishabhShenoy03/claude-hackathon/actions/workflows/windows.yml).
The executable is unsigned. Windows may show a publisher warning.

**Validation:** 12 engine tests pass on Linux, including OCR. Windows packaging
and executable smoke-test results are recorded in Actions. Desktop visual
testing remains pending. The release link works after a successful workflow run.

## Use

### Direct editing and navigation

- **Edit → Edit text boxes:** shows section outlines. Click a section and type
  directly on the page. Letters shift immediately as you type or Backspace.
  The lower-right handle resizes the box and changes wrapping. Click outside,
  Apply, or Ctrl+Enter to apply; Escape cancels. Ctrl+Z/Ctrl+Y work within the
  active editor. The exported PDF reuses the original embedded font and background.
- Selecting text opens a compact **Edit section / Highlight / Redact / Copy**
  toolbar next to the selection. Mixed font styles become separate editable runs.
- **Ctrl+F:** live find with yellow on-page matches, an orange active match, and
  Previous/Next navigation. Search highlighting is temporary and is not exported.
- **Ctrl + mouse wheel:** zoom in/out. Normal wheel scrolls the page.
- **Undo / Redo:** always visible in the header; Ctrl+Z / Ctrl+Y also work.
- The left sidebar displays clickable page thumbnails, rendered in idle batches.
- Redact works on dragged text selections as well as selected page areas.

Inline editing currently handles upright pages and horizontal text. OCR is
needed for scanned text. Boxes keep their original font size; enlarge a box when
more lines are needed. Edits that overlap another section are rejected. Fonts
missing replacement glyphs cannot be silently substituted. While typing, the
editor uses a sampled solid background; applying retains the PDF's actual
background graphics. This is a first inline editor, not full Acrobat parity.

Open a PDF, select a page in the sidebar, and use the ribbon tabs.
In **Select text** mode, drag across characters, then click Highlight (or Ctrl+H
or right-click → Highlight selected text). This highlights only that selection,
including selections across multiple lines. Switch to **Select area** before
placing text, images, signatures, fields, comments/links, cropping, or redacting.
Save as exports the document.

**Replace text** opens a searchable list of individual matches across every page.
Select a result or use Previous/Next; the viewer scrolls to the orange outline.
The dialog shows the detected font, size and colour. Replace selected changes
only that occurrence, retaining its baseline, size, font outlines, colour and
underlying background. Text that would overlap its neighbour is rejected rather
than silently resized. Missing subset-font glyphs and mixed-style matches are
reported without changing the PDF. Paragraph reflow is not supported.

**Export Word** reconstructs editable paragraphs, styled runs, tables, images and
page layout with pdf2docx. It is no longer the plain-text export used in build 1.
Scanned documents need OCR first. Highly designed pages, unusual fonts and
complex vector graphics may still differ from the PDF; review the result in Word.
Ctrl+O opens, Ctrl+S exports, Ctrl+Z undoes and Ctrl+Y redoes changes (up to 8 undo snapshots).
Normal export is unencrypted. Password export creates an AES-256 encrypted copy.

## Feature progress

| Feature | Implementation and limits |
| --- | --- |
| Merge, split, extract, reorder, duplicate pages | Implemented; ranges such as `3,1-2,3` |
| Rotate, delete, insert blank, crop | Implemented |
| Add text and images | Implemented; basic Latin text font; choose an area |
| Replace existing text | One selected match; embedded font, size, colour and baseline preserved; transparent text removal preserves background; no paragraph reflow |
| Highlight, comments, hyperlinks | Drag-selected text highlighting; comments and links use area selection |
| Visual signatures | Draw and embed; not cryptographic certificate signatures |
| Create/fill forms | Interactive text fields and checkboxes; no XFA support |
| Redaction | Removes intersecting text, image pixels, and graphics; cleaned full export required |
| Metadata/attachment cleanup | Implemented; not a comprehensive hidden-content audit |
| Password protection | AES-256 opening password; normal export removes encryption |
| OCR | English Tesseract bundled in Windows build; selected pages rasterized with searchable text; those pages lose forms/links |
| PDF to Word | Editable layout reconstruction including styles, tables and images; complex layout fidelity varies |
| PDF to text/PNG | Implemented |
| Images to PDF | Implemented |
| Office to PDF | Requires separately installed LibreOffice |
| Document comparison | Text diff HTML; image/layout differences not detected |
| Compression/batch | Lossless stream compression and garbage collection; reduction not guaranteed |
| Watermarks, numbering, bookmarks, metadata | Implemented |
| Search | Searches text on all pages; OCR needed for scans |
| Remote signature delivery/identity/audit service | Not implemented |
| Certificate signatures, real-time cloud collaboration | Not implemented |
| Exact Word reconstruction, arbitrary paragraph editing | Not implemented |
| Accessibility remediation, PDF/A conformance validation, AI assistant | Not implemented |

This is an independent implementation using open-source PDF engines, not a
claim of complete Acrobat compatibility. Modified signed PDFs may invalidate
existing digital signatures. OCR and conversion quality depend on the input.

## Development

Python 3.12 recommended:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python app.py
```

Linux development needs Tk installed; OCR needs `tesseract` on PATH.
The Windows workflow builds a portable one-file EXE and tests the packaged GUI.
No Windows executable is produced by a Linux PyInstaller build.

To build directly on Windows, install Python 3.12, optionally install Tesseract
to its default location, then run `powershell -ExecutionPolicy Bypass -File
build-windows.ps1` from the source folder. The result is
`dist/OpenPDF-Studio.exe`. The script tests the engine and packaged app.

## Hackathon evidence

The repository contains tests that reopen exported PDFs to check page structure,
form values, password protection, redaction, images and text. Use your own varied
PDFs to compare the supported workflows against Acrobat; no Acrobat behaviour
study, pricing evidence or feature-parity benchmark is claimed yet.

## License

AGPL-3.0-or-later; see LICENSE and THIRD_PARTY.md.
