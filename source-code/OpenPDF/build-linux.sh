#!/usr/bin/env bash
# Linux counterpart of build-windows.ps1: tests, one-file build, frozen self-test.
set -euo pipefail
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -v
# Pillow's Tk bridge is imported dynamically on Linux; PyInstaller misses it.
python3 -m PyInstaller --noconfirm --clean --onefile --windowed --name OpenPDF \
  --collect-all pymupdf --collect-all pdf2docx --collect-submodules fontTools.ttLib.tables \
  --hidden-import PIL._tkinter_finder \
  --add-data 'LICENSE:.' --add-data 'THIRD_PARTY.md:.' app.py
if ! command -v tesseract >/dev/null; then
  echo 'warning: Tesseract not installed: OCR needs tesseract-ocr on PATH at runtime.' >&2
fi
# The self-test opens Tk windows; use a virtual display when none is available.
run=(dist/OpenPDF --self-test)
if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null; then
  run=(xvfb-run -a -s '-screen 0 1600x1200x24' "${run[@]}")
fi
"${run[@]}"
echo 'Built dist/OpenPDF'
