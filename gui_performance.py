"""Exercise drag fast paths and cache invalidation in source and packaged Tk."""
import time
from types import SimpleNamespace
from unittest.mock import patch
import fitz
from rich_boxes import new_box


def exercise_performance(app):
    app.dirty = False
    app.new()
    page = app.pdf.doc[0]
    page.insert_textbox((40, 40, 540, 780), 'A useful paragraph with words to drag and edit. ' * 24, fontsize=12)
    for i in range(20):
        app.pdf.doc.new_page().insert_text((40, 50), f'Unchanged page {i + 2}')
    app.index = 0
    app.refresh()
    app.after(250, app.quit)
    app.mainloop()
    app.update()
    assert len(app.pages.images) < 10, 'Thumbnail renderer eagerly rendered the whole document'
    other_images = {i: photo for i, photo in app.pages.images.items() if i != 0}
    app.edit_mode()
    section = app.native_sections()[0]
    start = time.perf_counter()
    app.begin_inline(section)
    app.update()
    opened_ms = (time.perf_counter() - start) * 1000
    editor = app.inline
    anchor = SimpleNamespace(x=90, y=58)
    editor.start_move(anchor)
    start = time.perf_counter()
    with patch.object(fitz.Page, 'get_pixmap', side_effect=AssertionError('PDF rendered during drag')), \
         patch.object(fitz.Page, 'get_text', side_effect=AssertionError('Text extracted during drag')), \
         patch.object(fitz.Document, 'tobytes', side_effect=AssertionError('Document snapshotted during drag')), \
         patch.object(editor.toolbar, 'update_idletasks', side_effect=AssertionError('Forced layout during drag')):
        for n in range(120):
            editor.move(SimpleNamespace(x=90 + n % 3, y=58))
            editor.flush_position()
            app.update_idletasks()
    drag_ms = (time.perf_counter() - start) * 1000 / 120
    rendered = []
    original = fitz.Page.get_pixmap
    def record(page, *args, **kwargs):
        rendered.append(page.number)
        return original(page, *args, **kwargs)
    start = time.perf_counter()
    with patch.object(fitz.Page, 'get_pixmap', record):
        editor.key_commit()
        app.update()
    commit_ms = (time.perf_counter() - start) * 1000
    assert rendered and set(rendered) == {0}, f'Editing page 1 rendered other pages: {rendered}'
    assert all(app.pages.images[i] is photo for i, photo in other_images.items()), 'Unchanged thumbnails were rebuilt'
    assert len(app.pdf.doc[0].get_text()) > 1000
    # Selection/display work reuses the exact current raster and text geometry.
    with patch.object(fitz.Page, 'get_pixmap', side_effect=AssertionError('Cached page rendered again')), \
         patch.object(fitz.Page, 'get_text', side_effect=AssertionError('Cached section extracted again')):
        app.render()
        app.native_sections()

    app.begin_box(new_box((40, 40, 540, 780)))
    editor = app.inline
    editor.widget.insert('1.0', 'Long editable text ' * 500)
    editor.widget.tag_add('sel', '1.0', '1.4')
    editor.format_selection(color='#ff0000')
    start = time.perf_counter()
    with patch.object(editor, 'style_at', side_effect=AssertionError('Per-character style lookup during snapshot')):
        value = editor.value()
    rich_snapshot_ms = (time.perf_counter() - start) * 1000
    assert value['runs'][0]['text'] == 'Long'
    assert value['runs'][0]['style']['color'] == '#ff0000'
    assert len(value['runs']) == 2, 'Bulk extraction lost style boundaries'
    editor.cancel()
    print(f'PERFORMANCE: native editor open={opened_ms:.1f}ms; drag frame average={drag_ms:.2f}ms; '
          f'apply+page refresh={commit_ms:.1f}ms; 9500-character rich snapshot={rich_snapshot_ms:.1f}ms')
