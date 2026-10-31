# Third-party components

OpenPDF Studio uses PyMuPDF / MuPDF under their AGPL terms. The application
is distributed under AGPL-3.0-or-later. Corresponding source is published at
https://github.com/lukeai-tan/claude-hackathon with each release linked to its commit.

Other components include Python/Tk, Pillow, python-docx, PyInstaller,
and the Tesseract OCR distribution. Their respective notices and licenses
remain applicable. PyInstaller collects package data; the complete Tesseract
installation, including its bundled notices and dependencies, is included.

Build dependencies are pinned in requirements.txt. The OCR runtime is installed
by Chocolatey on the build runner. LibreOffice is optional and installed by the
user separately; it is not bundled. This project is not affiliated with Adobe.
