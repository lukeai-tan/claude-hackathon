OpenSuite 0.4.0 keeps the integrated workspace and the OpenSlides editor, and
adds five rounds of OpenPDF work that move it toward Acrobat-style parity.

## Comment & markup toolkit

- Text markup over a selection: strikethrough, underline and squiggly, from the
  Annotate panel, the right-click menu, or the Markup button on the selection toolbar.
- Sticky notes and free-text callouts; line, arrow, rectangle and oval shapes;
  and Adobe-style rubber stamps (Approved, Confidential, Draft and more).
- A comment list that shows every annotation with its page, type and author, and
  jumps to or deletes any of them. All markup survives save and reopen.

## Password permissions

- Password export now offers an AES-256 open password plus per-permission
  checkboxes: allow or deny printing, copying, editing, commenting and form
  filling, enforced through a separate owner password.

## Richer form fields

- New dropdown, list box and signature fields alongside text and checkbox fields.
- Import and export form data as XFDF (readable by OpenPDF or Acrobat), so a
  filled form's answers can be reused across copies.

## PDF Optimizer

- A new Optimize dialog downsamples and recompresses images (adjustable DPI and
  JPEG quality), subsets fonts and can strip metadata, with a before/after size
  estimate. It always writes a new file and never alters the open document.

## Bates numbering and headers/footers

- Headers and footers with left/centre/right slots and `<page>`, `<pages>`,
  `<date>` and `<filename>` tokens.
- Bates numbering with prefix/suffix, start number, zero-padding and position,
  with a sequence that can continue across documents.

---

Windows builds include English OCR. CI tests the PDF engine, the real desktop
controls, compact layouts and the packaged suite before publishing. Executables
are unsigned, so Windows may show a publisher warning.
