"""Exercise real Tk selection and replacement controls in the Windows EXE."""
import tempfile
from pathlib import Path
import fitz
import tkinter as tk
from types import SimpleNamespace
from unittest.mock import patch
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
        editable_text = ''.join(node.text or '' for node in doc.element.xpath('.//w:t'))
        print('Packaged Word export editable text:', repr(editable_text))
        assert 'fixed' in editable_text, 'Replacement missing from editable Word text'

    # Close search/replace dialogs and exercise direct section editing.
    for child in app.winfo_children():
        if isinstance(child, tk.Toplevel):
            child.destroy()
    app.dirty = False
    app.new()
    p = app.pdf.doc[0]
    p.insert_text((50, 100), 'Editable text', fontname='hebo', fontsize=18)
    p.insert_text((50, 250), 'Keep me', fontsize=12)
    app.refresh()
    app.update()
    assert app.pages.images, 'Sidebar thumbnail was not rendered'
    app.edit_mode()
    assert app.canvas.find_withtag('text-box'), 'Edit mode has no text box outlines'
    app.canvas.event_generate('<ButtonPress-1>', x=80, y=115)
    app.update()
    assert app.inline is not None, 'Click did not open inline editor'
    editor = app.inline
    editor.widget.focus_force()
    editor.widget.mark_set('insert', '1.4')
    editor.widget.insert('insert', 'X')
    app.update()
    assert editor.widget.get('1.0', 'end-1c') == 'EditXable text'
    editor.widget.event_generate('<BackSpace>')
    app.update()
    assert editor.widget.get('1.0', 'end-1c') == 'Editable text', 'Backspace did not edit live'
    editor.widget.delete('1.0', 'end')
    editor.widget.insert('1.0', 'Live edit')
    editor.key_commit()
    app.update()
    assert 'Live edit' in app.pdf.doc[0].get_text()
    app.undo()
    assert 'Editable text' in app.pdf.doc[0].get_text()
    app.redo()
    assert 'Live edit' in app.pdf.doc[0].get_text()

    # Actual Ctrl+F opens find; results are page overlays rather than PDF edits.
    app.focus_force()
    app.event_generate('<Control-f>')
    app.update()
    assert app.search_window is not None, 'Ctrl+F did not open find'
    app.find_entry.insert(0, 'Live')
    app.after(300, app.quit)
    app.mainloop()
    app.update()
    assert app.canvas.find_withtag('search-result'), 'Find did not highlight words on page'
    zoom = app.zoom
    app.wheel(SimpleNamespace(state=4, delta=120, num=0, widget=app.canvas))
    assert app.zoom > zoom, 'Ctrl+wheel did not zoom'
    app.scale(1 / 1.1)

    # Drag selection offers contextual actions, including text redaction.
    app.selection_mode.set('text')
    app.clear_selection()
    app.render()
    app.canvas.xview_moveto(0)
    app.canvas.yview_moveto(0)
    r = app.pdf.doc[0].search_for('Live')[0]
    app.canvas.event_generate('<ButtonPress-1>', x=int(r.x0 + 21), y=int(r.y0 + 22))
    app.canvas.event_generate('<B1-Motion>', x=int(r.x1 + 19), y=int(r.y0 + 22))
    app.canvas.event_generate('<ButtonRelease-1>', x=int(r.x1 + 19), y=int(r.y0 + 22))
    app.update()
    assert app.context_frame is not None, 'Selection did not show contextual actions'
    labels = [w.cget('text') for w in app.context_frame.winfo_children()]
    assert all(s in labels for s in ('Edit section', 'Highlight', 'Redact', 'Copy'))
    from tkinter import messagebox
    with patch.object(messagebox, 'askyesno', return_value=True):
        app.redact()
    assert not app.pdf.doc[0].search_for('Live'), 'Selected text was not redacted'
    assert app.pdf.doc[0].search_for('Keep me'), 'Text redaction affected another section'
    app.undo()
    assert app.pdf.doc[0].search_for('Live')
