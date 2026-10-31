"""Check the integrated PDF workspace at its minimum supported window size."""
import os
from rich_boxes import new_box


def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)


def capture(app, name):
    if os.environ.get('OPENPDF_UI_CAPTURE') == '1':
        from PIL import ImageGrab
        ImageGrab.grab(bbox=(app.winfo_rootx(), app.winfo_rooty(),
                            app.winfo_rootx() + app.winfo_width(),
                            app.winfo_rooty() + app.winfo_height())).save(name)


def exercise_layout(app):
    app.dirty = False
    app.new()
    app.stop_pen()
    app.geometry('1000x650+0+0')
    app.update()
    for name in app.rail_buttons:
        app.show_tool_panel(name)
        app.update()
        for widget in descendants(app.tool_panel):
            if widget.winfo_class() == 'TButton':
                assert widget.winfo_width() >= widget.winfo_reqwidth(), f'{name}: clipped {widget.cget("text")}'
    app.show_tool_panel('Edit')
    app.update()
    for widget in descendants(app.navigation):
        if widget.winfo_class() in ('TButton', 'TRadiobutton', 'TLabel'):
            assert widget.winfo_width() >= widget.winfo_reqwidth(), 'Navigation control clipped'
    app.rail_view.yview_moveto(1)
    app.update()
    last = app.rail_buttons['Tools']
    assert last.winfo_rooty() >= app.rail_view.winfo_rooty()
    assert last.winfo_rooty() + last.winfo_height() <= app.rail_view.winfo_rooty() + app.rail_view.winfo_height(), 'Tools category cannot be reached'
    app.rail_view.yview_moveto(0)
    app.fit_page()
    app.update()
    capture(app, 'openpdf-compact-workspace.png')

    app.zoom = 1
    app.render()
    app.canvas.xview_moveto(0)
    app.canvas.yview_moveto(0)
    app.begin_box(new_box((45, 160, 300, 210)))
    editor = app.inline
    editor.widget.insert('1.0', 'Formatting stays accessible')
    for size in ('1000x650', '1200x760', '1000x650'):
        app.geometry(size + '+0+0')
        app.update()
        editor.flush_position()
        app.update()
        canvas = app.canvas
        x, y = canvas.coords(editor.toolbar_id)
        width, height = editor.toolbar_size
        assert x >= canvas.canvasx(0) and y >= canvas.canvasy(0)
        assert x + width <= canvas.canvasx(0) + canvas.winfo_width(), 'Formatting toolbar extends beyond viewport'
        assert y + height <= canvas.canvasy(0) + canvas.winfo_height(), 'Formatting toolbar below viewport'
        for widget in descendants(editor.toolbar):
            if widget.winfo_class() in ('TButton', 'TCombobox', 'TSpinbox'):
                assert widget.winfo_width() >= widget.winfo_reqwidth(), 'Formatting control squeezed'
                assert widget.winfo_rootx() + widget.winfo_width() <= editor.toolbar.winfo_rootx() + width, 'Formatting control offscreen'
    capture(app, 'openpdf-compact-editor.png')
    editor.key_commit()
    app.update()
    assert 'Formatting stays accessible' in app.pdf.doc[0].get_text()
    app.undo()
    assert 'Formatting stays accessible' not in app.pdf.doc[0].get_text()
    app.redo()
    assert 'Formatting stays accessible' in app.pdf.doc[0].get_text()
    print('PDF minimum-window navigation, wrapped actions, reachable categories, responsive toolbar and resize checks passed.')
