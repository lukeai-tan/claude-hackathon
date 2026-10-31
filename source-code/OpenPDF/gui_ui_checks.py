"""Regression checks for small-font caret, automatic fit and UI typography."""
import base64
import io
import os
from tkinter import ttk, font as tkfont
from rich_boxes import new_box, boxes


def exercise_ui(app):
    app.dirty = False
    app.new()
    app.zoom = 1
    app.render()
    app.begin_box(new_box((50, 80, 74, 104)))
    editor = app.inline
    editor.widget.insert('1.0', 'Auto fit\nSecond line')
    editor.size.set('36')
    editor.set_size()
    editor.fit_live(strict=True)
    assert editor.rect.height > 60 and editor.rect.width > 24, 'Large font did not grow the tiny box'
    editor.key_commit()
    app.update()
    saved = boxes(app.pdf.doc[0])[0]
    assert saved['runs'][0]['style']['size'] == 36, 'Auto fit silently changed font size'
    assert 'Second' in app.pdf.doc[0].get_text()
    app.undo()
    assert not boxes(app.pdf.doc[0]), 'Auto-sized box did not undo'

    app.geometry('1100x740+0+0')
    app.zoom = 2
    app.render()
    app.canvas.xview_moveto(0)
    app.canvas.yview_moveto(0)
    app.begin_box(new_box((60, 170, 400, 260)))
    editor = app.inline
    editor.widget.insert('1.0', 'Small text at five points\nSecond line')
    editor.widget.tag_add('sel', '1.0', 'end-1c')
    editor.size.set('5')
    editor.set_size()
    editor.format_selection(color='#3159c8')
    editor.widget.tag_remove('sel', '1.0', 'end')
    editor.widget.mark_set('insert', 'end-1c')
    editor.widget.focus_force()
    app.update()
    editor.fit_live(strict=True)
    editor.flush_position()
    editor.caret.refresh()
    app.update_idletasks()
    font, _ = editor.caret_font()
    assert editor.style_at('1.1')['size'] == 5
    assert str(editor.widget.cget('font')) == str(font), 'Text base font retained the old larger size'
    assert editor.caret.geometry is not None, 'Custom caret was not shown'
    assert editor.caret.geometry['height'] <= font.metrics('linespace') + 1, 'Caret exceeds the active font height'
    line = editor.widget.dlineinfo('insert')
    assert line[3] <= font.metrics('linespace') + 3, 'Small-font line retained oversized spacing'
    expected_y = line[1] + line[4] - font.metrics('ascent')
    assert abs(editor.caret.geometry['y'] - expected_y) <= 1, 'Caret is not aligned with the text baseline'
    ui_font = ttk.Style(app).lookup('Editor.TButton', 'font')
    assert 'TkDefaultFont' in str(ui_font), 'Editor buttons inherited a document font'
    assert tkfont.nametofont('TkDefaultFont').cget('size') == 10
    for row in editor.toolbar.winfo_children():
        for control in row.winfo_children():
            if control.winfo_class() == 'TButton':
                assert control.winfo_width() >= control.winfo_reqwidth(), 'Button label was squeezed/clipped'
    print('Small-font caret/baseline, UI font isolation, automatic sizing and undo passed.')
    if os.environ.get('OPENPDF_UI_CAPTURE') == '1':
        from PIL import ImageGrab
        app.update()
        shot = ImageGrab.grab(bbox=(app.winfo_rootx(), app.winfo_rooty(),
                                   app.winfo_rootx() + app.winfo_width(), app.winfo_rooty() + app.winfo_height()))
        stream = io.BytesIO()
        shot.save(stream, format='PNG')
        shot.save('openpdf-editor.png')
        print('UI_CAPTURE: ' + base64.b64encode(stream.getvalue()).decode('ascii'))
    editor.cancel()


    # Capture the normal document workspace separately from the caret fixture.
    app.geometry('1440x900+0+0')
    app.show_tool_panel('Edit')
    app.pdf.doc[0].insert_text((58, 100), 'Every page, a possibility.', fontsize=25, color=(.18,.14,.29))
    app.pdf.doc[0].insert_text((58, 145), 'OpenPDF / A workspace for your documents', fontsize=12, color=(.44,.33,.84))
    app.pdf.doc[0].insert_text((58, 205), 'Edit text, annotate, organise pages and export.\nYour files stay on your computer.', fontsize=12)
    app.view_cache.invalidate()
    app.update()
    app.fit_page()
    app.update()
    assert app.document_label.get(), 'Document title missing'
    assert len(app.rail_buttons) == 8, 'Missing tool categories'
    if os.environ.get('OPENPDF_UI_CAPTURE') == '1':
        from PIL import ImageGrab
        ImageGrab.grab(bbox=(app.winfo_rootx(), app.winfo_rooty(), app.winfo_rootx()+app.winfo_width(), app.winfo_rooty()+app.winfo_height())).save('openpdf-workspace.png')
