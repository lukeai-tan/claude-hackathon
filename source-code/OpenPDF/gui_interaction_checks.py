"""Real Tk regressions for scrolling, highlight modes, edit toggle and watermark."""
import tkinter as tk
from unittest.mock import patch
import fitz


def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)


def exercise_interactions(app):
    app.dirty = False
    app.new()
    app.stop_pen()
    app.zoom = 2
    app.refresh()
    app.update()
    canvas = app.canvas
    canvas.xview_moveto(.2)
    canvas.yview_moveto(.2)
    x, y = canvas.canvasx(0), canvas.canvasy(0)
    with patch('scroll_tools.wheel_setting', return_value=3):
        canvas.event_generate('<Shift-MouseWheel>', delta=-120)
        app.update()
        assert canvas.canvasx(0) > x, 'Horizontal trackpad did not move the PDF'
        assert canvas.canvasy(0) == y, 'Horizontal gesture scrolled vertically'
        x = canvas.canvasx(0)
        canvas.event_generate('<MouseWheel>', delta=-12)
        app.update()
        moved = canvas.canvasy(0) - y
        expected = 10 * canvas.winfo_fpixels('1i') / 96
        assert abs(moved - expected) <= 1, f'Small wheel delta amplified: {moved}'
        assert canvas.canvasx(0) == x
        zoom = app.zoom
        canvas.event_generate('<Control-MouseWheel>', delta=120)
        app.update()
        assert app.zoom > zoom, 'Ctrl+wheel zoom regressed'

    app.zoom = 1
    app.pdf.doc[0].insert_text((50, 100), 'Highlight this text', fontsize=18)
    app.refresh()
    canvas.xview_moveto(0)
    canvas.yview_moveto(0)
    app.update()
    app.show_tool_panel('Edit')
    app.update()
    raster = app.photo
    geometry = [(w, w.winfo_geometry()) for w in descendants(app)
                if w.winfo_class() in ('TButton', 'TRadiobutton', 'TNotebook')]
    button = next(w for w, _ in geometry if w.winfo_class() == 'TButton' and w.cget('text') == 'Edit text boxes')
    button.invoke()
    assert canvas.find_withtag('text-box')
    button.invoke()
    app.update()
    assert app.selection_mode.get() == 'text' and not canvas.find_withtag('text-box')
    assert app.photo is raster, 'Mode toggle unnecessarily changed the page raster'
    assert all(w.winfo_geometry() == g for w, g in geometry), 'Mode toggle changed the UI layout'

    # Toggling off commits an active edit, keeping undo and redo functional.
    button.invoke()
    app.begin_inline(app.native_sections()[0])
    app.inline.widget.delete('1.0', 'end')
    app.inline.widget.insert('1.0', 'Highlight edited text')
    button.invoke()
    assert app.inline is None and app.selection_mode.get() == 'text'
    assert 'edited' in app.pdf.doc[0].get_text()
    app.undo()
    assert 'this' in app.pdf.doc[0].get_text()
    app.redo()
    assert 'edited' in app.pdf.doc[0].get_text()

    # Use the unchanged Highlight button's menu to enter each persistent mode.
    with patch.object(tk.Menu, 'tk_popup'):
        app.highlight()
    app.highlight_menu.invoke(0)
    rect = app.pdf.doc[0].search_for('Highlight')[0]
    start = (int(rect.x0 + 21), int(rect.y0 + 22))
    end = (int(rect.x1 + 19), int(rect.y0 + 22))
    canvas.event_generate('<ButtonPress-1>', x=start[0], y=start[1])
    canvas.event_generate('<B1-Motion>', x=end[0], y=end[1])
    canvas.event_generate('<ButtonRelease-1>', x=end[0], y=end[1])
    assert app.selection_mode.get() == 'highlight'
    page = app.pdf.doc[0]
    assert list(page.annots())[0].type[0] == fitz.PDF_ANNOT_HIGHLIGHT
    app.undo()
    assert not list(app.pdf.doc[0].annots() or [])
    app.redo()
    assert len(list(app.pdf.doc[0].annots())) == 1

    with patch.object(tk.Menu, 'tk_popup'):
        app.highlight()
    app.highlight_menu.invoke(1)
    app.pdf.doc[0].set_rotation(90)
    app.refresh()
    canvas.xview_moveto(0)
    canvas.yview_moveto(0)
    canvas.event_generate('<ButtonPress-1>', x=120, y=180)
    canvas.event_generate('<B1-Motion>', x=200, y=220)
    assert canvas.find_withtag('ink-preview')
    canvas.event_generate('<ButtonRelease-1>', x=240, y=230)
    page = app.pdf.doc[0]
    annotations = list(page.annots())
    assert len(annotations) == 2
    mark = annotations[-1]
    assert mark.info['subject'] == 'Freehand highlight' and abs(mark.opacity - .35) < .01
    displayed = fitz.Point(mark.vertices[0][0]) * page.rotation_matrix
    assert displayed.distance_to(fitz.Point(100, 160)) < .1, 'Rotated freehand highlight is misplaced'
    canvas.event_generate('<ButtonPress-1>', x=120, y=240)
    app.escape_mode()
    canvas.event_generate('<ButtonRelease-1>', x=200, y=240)
    assert len(list(app.pdf.doc[0].annots())) == 2, 'Escape saved an unfinished highlight'
    app.escape_mode()
    assert app.selection_mode.get() == 'text'
    app.undo()
    assert len(list(app.pdf.doc[0].annots())) == 1
    app.redo()
    assert len(list(app.pdf.doc[0].annots())) == 2

    # Apply default full-page diagonal settings through the actual dialog.
    app.watermark()
    app.update()
    dialog = next(w for w in app.winfo_children() if isinstance(w, tk.Toplevel) and w.title() == 'Watermark')
    controls = list(descendants(dialog))
    next(w for w in controls if w.winfo_class() == 'TEntry').insert(0, 'DRAFT')
    next(w for w in controls if w.winfo_class() == 'TButton' and w.cget('text') == 'Apply').invoke()
    assert not dialog.winfo_exists()
    assert 'DRAFT' in app.pdf.doc[0].get_text()
    assert 'edited' in app.pdf.doc[0].get_text(), 'Watermark removed existing text'
    app.undo()
    assert 'DRAFT' not in app.pdf.doc[0].get_text()
    app.redo()
    assert 'DRAFT' in app.pdf.doc[0].get_text()
    print('Horizontal/fine scrolling, edit toggle, both highlight modes, rotated strokes and watermark dialog passed.')
