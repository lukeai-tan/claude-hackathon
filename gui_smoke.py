"""Exercise real Tk selection and replacement controls in the Windows EXE."""
import tempfile
from pathlib import Path
import fitz
from docx import Document
from text_tools import find_matches


def exercise_app(app):
    app.new()
    p = app.pdf.doc[0]
    p.insert_text((50, 100), 'problem one and problem two', fontsize=18, fontname='hebo')
    app.refresh()
    app.update()
    r = fitz.Rect(find_matches(app.pdf.doc, 'problem')[1]['rect'])
    app.canvas.event_generate('<ButtonPress-1>', x=int(r.x0 + 21), y=int(r.y0 + 22))
    app.canvas.event_generate('<B1-Motion>', x=int(r.x1 + 19), y=int(r.y0 + 22))
    app.update()
    assert app.text_quads, 'Mouse drag did not select text'
    app.highlight()
    assert len(list(app.pdf.doc[0].annots())) == 1
    app.replace()
    app.update()
    def descendants(widget):
        for child in widget.winfo_children():
            yield child
            yield from descendants(child)
    controls = list(descendants(app))
    entries = [w for w in controls if w.winfo_class() == 'TEntry']
    entries[0].insert(0, 'problem')
    entries[1].insert(0, 'fixed')
    next(w for w in controls if w.winfo_class() == 'TButton' and w.cget('text') == 'Find matches').invoke()
    app.update()
    # Select second match through the list and invoke actual replacement button.
    match_list = next(w for w in controls if w.winfo_class() == 'Listbox' and w is not app.pages)
    match_list.selection_clear(0, 'end')
    match_list.selection_set(1)
    match_list.event_generate('<<ListboxSelect>>')
    app.update()
    next(w for w in controls if w.winfo_class() == 'TButton' and w.cget('text') == 'Replace selected').invoke()
    app.update()
    assert len(app.pdf.doc[0].search_for('problem')) == 1
    assert len(app.pdf.doc[0].search_for('fixed')) == 1
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'packaged-export.docx'
        app.pdf.export_docx(path)
        doc = Document(path)
        assert any('fixed' in p.text for p in doc.paragraphs)
