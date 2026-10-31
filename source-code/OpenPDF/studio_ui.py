"""OpenSuite workspace styling, shared visually with OpenSlides."""
import tkinter as tk
from tkinter import ttk, font as tkfont
from thumbnails import Thumbnails
from ui_tools import configure_ui_fonts
from scroll_tools import CanvasScroll

PURPLE = '#7054d7'
INK = '#252333'
MUTED = '#777282'
PAPER = '#ffffff'
MAT = '#eeedf2'


def build_workspace(app):
    style = ttk.Style(app)
    style.theme_use('clam')
    configure_ui_fonts(app, style)
    app.configure(background=PAPER)
    style.configure('.', background=PAPER, foreground=INK)
    style.configure('TFrame', background=PAPER)
    style.configure('TLabel', background=PAPER, foreground=INK)
    style.configure('Muted.TLabel', foreground=MUTED)
    style.configure('Header.TLabel', font=('Segoe UI', 17, 'bold'))
    style.configure('Panel.TLabel', font=('Segoe UI', 16, 'bold'))
    style.configure('TButton', padding=(10, 7), background=PAPER, bordercolor='#e3e2e9', relief='flat')
    style.map('TButton', background=[('active', '#f0ebff')], bordercolor=[('focus', PURPLE)])
    style.configure('Primary.TButton', background=PURPLE, foreground='white', bordercolor=PURPLE)
    style.map('Primary.TButton', background=[('active', '#6042c4')], foreground=[('disabled', '#d5c9f4')])
    style.configure('Action.TButton', padding=(13, 11), anchor='w', background='#f8f6fc')
    style.configure('TEntry', fieldbackground=PAPER, bordercolor='#dcd9e4', padding=5)
    style.configure('TCombobox', fieldbackground=PAPER, bordercolor='#dcd9e4', padding=4)
    style.configure('Treeview', background='#faf9fc', fieldbackground='#faf9fc', borderwidth=0)
    style.map('Treeview', background=[('selected', '#eee7ff')], foreground=[('selected', '#633fc2')])
    style.configure('Vertical.TScrollbar', background='#d9d1e5', troughcolor='#faf9fc', borderwidth=0, arrowsize=12)
    style.configure('Horizontal.TScrollbar', background='#d9d1e5', troughcolor=MAT, borderwidth=0)
    style.configure('Editor.TButton', font='TkDefaultFont', padding=(7, 4))
    app.document_label = tk.StringVar(value='Your document workspace')
    app.save_label = tk.StringVar(value='Local & private')
    header = ttk.Frame(app, padding=(16, 10))
    header.pack(fill='x')
    header.columnconfigure(1, weight=1)
    brand = ttk.Frame(header)
    brand.grid(row=0, column=0, sticky='w')
    ttk.Label(brand, text='▣', foreground=PURPLE, font=('Segoe UI', 23, 'bold')).pack(side='left', padx=(0, 9))
    ttk.Label(brand, text='OpenPDF', style='Header.TLabel').pack(side='left')
    ttk.Label(brand, text=' / OpenSuite', style='Muted.TLabel').pack(side='left', padx=(4, 12))
    ttk.Label(header, textvariable=app.document_label, width=1, anchor='w').grid(row=0, column=1, sticky='ew', padx=6)
    actions = ttk.Frame(header)
    actions.grid(row=0, column=2, sticky='e')
    header = actions
    ttk.Button(header, text='Save as', style='Primary.TButton', command=lambda: app.guard(app.save)).pack(side='right', padx=(8, 0))
    ttk.Button(header, text='Open PDF', command=lambda: app.guard(app.open)).pack(side='right', padx=4)
    ttk.Button(header, text='Redo', command=lambda: app.guard(app.redo)).pack(side='right', padx=4)
    ttk.Button(header, text='Undo', command=lambda: app.guard(app.undo)).pack(side='right', padx=4)
    ttk.Separator(app).pack(fill='x')
    body = ttk.Frame(app)
    body.pack(fill='both', expand=True)
    rail_view = tk.Canvas(body, background='#faf9fc', width=76, highlightthickness=0)
    rail_view.pack(side='left', fill='y')
    rail = tk.Frame(rail_view, background='#faf9fc')
    rail_window = rail_view.create_window(0, 0, window=rail, anchor='nw', width=76)
    rail.bind('<Configure>', lambda _: rail_view.configure(scrollregion=rail_view.bbox('all')))
    rail_view.bind('<Configure>', lambda e: rail_view.itemconfigure(rail_window, width=e.width))
    rail_scroll = CanvasScroll(rail_view)
    def scroll_rail(event):
        rail_scroll.wheel(event)
        return 'break'
    app.rail_view = rail_view
    ttk.Separator(body, orient='vertical').pack(side='left', fill='y')
    panel = ttk.Frame(body, width=236)
    panel.pack(side='left', fill='y')
    panel.pack_propagate(False)
    app.tool_panel = panel
    ttk.Separator(body, orient='vertical').pack(side='left', fill='y')
    # Page previews remain visible while switching tool categories.
    page_side = ttk.Frame(body, width=166, padding=(8, 12))
    page_side.pack(side='right', fill='y')
    page_side.pack_propagate(False)
    ttk.Label(page_side, text='Pages', font=('Segoe UI', 12, 'bold')).pack(anchor='w', padx=5)
    ttk.Label(page_side, text='Drag to reorder', style='Muted.TLabel').pack(anchor='w', padx=5, pady=(4, 10))
    app.pages = Thumbnails(page_side, app.go, app.reorder_page, lambda: app.inline is not None)
    app.pages.pack(fill='both', expand=True)
    ttk.Separator(body, orient='vertical').pack(side='right', fill='y')
    viewer = ttk.Frame(body)
    viewer.pack(side='left', fill='both', expand=True)
    nav = ttk.Frame(viewer, padding=(8, 7))
    nav.pack(fill='x')
    app.navigation = nav
    navigation_buttons = ttk.Frame(nav)
    navigation_buttons.pack(anchor='w')
    for label, command in [('‹', lambda: app.navigate(-1)), ('›', lambda: app.navigate(1)),
                           ('−', lambda: app.scale(.8)), ('+', lambda: app.scale(1.25)), ('Fit page', app.fit_page)]:
        ttk.Button(navigation_buttons, text=label, width=8 if label=='Fit page' else 2, command=lambda c=command: app.guard(c)).pack(side='left', padx=2)
    navigation_details = ttk.Frame(nav)
    navigation_details.pack(fill='x', pady=(5, 0))
    ttk.Radiobutton(navigation_details, text='Text', variable=app.selection_mode, value='text', command=app.clear_selection).pack(side='left', padx=(2, 3))
    ttk.Radiobutton(navigation_details, text='Area', variable=app.selection_mode, value='area', command=app.clear_selection).pack(side='left', padx=3)
    ttk.Label(navigation_details, textvariable=app.page_label, style='Muted.TLabel').pack(side='right', padx=6)
    ttk.Separator(viewer).pack(fill='x')
    area = ttk.Frame(viewer)
    area.pack(fill='both', expand=True)
    app.canvas = tk.Canvas(area, background=MAT, highlightthickness=0)
    app.canvas_scroll = CanvasScroll(app.canvas)
    ybar = ttk.Scrollbar(area, orient='vertical', command=app.canvas.yview)
    xbar = ttk.Scrollbar(area, orient='horizontal', command=app.canvas.xview)
    app.canvas.configure(yscrollcommand=ybar.set, xscrollcommand=xbar.set)
    ybar.pack(side='right', fill='y')
    xbar.pack(side='bottom', fill='x')
    app.canvas.pack(fill='both', expand=True)
    for event, handler in [('<ButtonPress-1>', app.start_selection), ('<B1-Motion>', app.drag_selection),
                           ('<ButtonRelease-1>', app.selection_popup), ('<MouseWheel>', app.wheel),
                           ('<Button-4>', app.wheel), ('<Button-5>', app.wheel),
                           ('<Shift-MouseWheel>', app.wheel), ('<Shift-Button-4>', app.wheel),
                           ('<Shift-Button-5>', app.wheel)]:
        app.canvas.bind(event, handler)
    if app.canvas_scroll.system == 'x11':
        for number in (6, 7):
            try:
                app.canvas.bind(f'<Button-{number}>', app.wheel)
            except tk.TclError:
                pass
    app.canvas.bind('<Configure>', lambda _: draw_welcome(app) if not app.pdf else None)
    menu = tk.Menu(app, tearoff=False)
    menu.add_command(label='Highlight selected text', command=lambda: app.guard(app.highlight))
    app.canvas.bind('<Button-3>', lambda e: menu.tk_popup(e.x_root, e.y_root))
    ttk.Separator(app).pack(fill='x')
    footer = ttk.Frame(app, padding=(14, 8))
    footer.pack(fill='x')
    ttk.Label(footer, textvariable=app.save_label, foreground=PURPLE).pack(side='right', padx=(16, 0))
    status_label = ttk.Label(footer, textvariable=app.status, style='Muted.TLabel', wraplength=850)
    status_label.pack(side='left', fill='x', expand=True)
    status_label.bind('<Configure>', lambda e: status_label.configure(wraplength=max(100, e.width)))
    groups = {
        'File': ('▤', 'A fresh start for every document.', [('Open PDF', app.open), ('New blank', app.new), ('Save as', app.save), ('Images to PDF', app.from_images), ('Office to PDF', app.from_office), ('Batch compress', app.batch)]),
        'Edit': ('T', 'Make every page yours.', [('Edit text boxes', app.edit_mode), ('Add text', app.text), ('Replace text', app.replace), ('Add image', app.image), ('Draw signature', app.signature), ('Highlight', app.highlight), ('Comment', app.comment), ('Add link', app.link)]),
        'Pages': ('▥', 'Put your story in order.', [('Merge', app.merge), ('Extract / reorder', app.select), ('Split all', app.split), ('Rotate', app.rotate), ('Delete page', app.delete), ('Blank page', app.blank), ('Crop selection', app.crop), ('Bookmark', app.bookmark)]),
        'Draw': ('✎', 'A personal touch, on the page.', [('Pen', app.pen_mode), ('Ink colour', app.pen_color), ('Done drawing', app.stop_pen)]),
        'Forms': ('☑', 'Turn documents into conversations.', [('Text field', lambda: app.field(False)), ('Checkbox', lambda: app.field(True)), ('Fill fields', app.fill)]),
        'Protect': ('◇', 'Choose what your document shares.', [('Redact selection', app.redact), ('Remove private data', app.sanitize), ('Password export', app.encrypt), ('Metadata', app.metadata)]),
        'Convert': ('⇄', 'The right format for your next step.', [('Export Word', app.docx), ('OCR pages', app.ocr), ('Export text', app.txt), ('Export PNGs', app.png), ('Compare text', app.compare), ('Compressed export', app.save)]),
        'Tools': ('⌕', 'The finishing touches.', [('Search', app.search), ('Watermark', app.watermark), ('Page numbers', app.numbers), ('Feature status', app.about)]),
    }
    app.rail_buttons = {}
    def show_panel(name):
        for child in panel.winfo_children():
            child.destroy()
        for key, button in app.rail_buttons.items():
            button.configure(background='#eee7ff' if key==name else '#faf9fc', foreground=PURPLE if key==name else '#686374')
        _, lead, actions = groups[name]
        scroll = tk.Canvas(panel, background=PAPER, highlightthickness=0)
        scrollbar = ttk.Scrollbar(panel, orient='vertical', command=scroll.yview)
        scroll.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side='right', fill='y')
        scroll.pack(side='left', fill='both', expand=True)
        content = ttk.Frame(scroll, padding=(13, 18))
        window = scroll.create_window(0, 0, window=content, anchor='nw')
        content.bind('<Configure>', lambda _: scroll.configure(scrollregion=scroll.bbox('all')))
        scroll.bind('<Configure>', lambda e: scroll.itemconfigure(window, width=e.width))
        ttk.Label(content, text=name, style='Panel.TLabel').pack(anchor='w')
        ttk.Label(content, text=lead, style='Muted.TLabel', wraplength=184).pack(anchor='w', pady=(9, 19))
        action_buttons = []
        for label, action in actions:
            button = ttk.Button(content, text=label, width=0, style='Action.TButton', command=lambda a=action: app.guard(a))
            button.pack(fill='x', pady=4)
            action_buttons.append((button, label))
        def wrap_actions(event):
            font = tkfont.nametofont('TkDefaultFont')
            available = max(60, event.width - 58)
            for button, label in action_buttons:
                lines, line = [], ''
                for word in label.split():
                    candidate = (line + ' ' + word).strip()
                    if line and font.measure(candidate) > available:
                        lines.append(line)
                        line = word
                    else:
                        line = candidate
                lines.append(line)
                button.configure(text='\n'.join(lines))
        content.bind('<Configure>', wrap_actions, add='+')
        if name=='Draw':
            ttk.Label(content, text='Thickness (pt)', style='Muted.TLabel').pack(anchor='w', pady=(18, 6))
            ttk.Spinbox(content, textvariable=app.ink_width, from_=.5, to=20, increment=.5, width=8).pack(anchor='w')
            ttk.Label(content, textvariable=app.ink_color_label, style='Muted.TLabel').pack(anchor='w', pady=12)
        hints={'Edit':'Choose Text to select words, or Area to place images and signatures.', 'Protect':'Redaction removes content from the exported PDF. Keep an original copy.', 'Convert':'OCR is included in the Windows download. Office import needs LibreOffice.', 'Pages':'Drag the page previews to reorder. Ctrl+Z undoes an edit.'}
        ttk.Label(content, text=hints.get(name, 'Your files stay on this computer. No account required.'), style='Muted.TLabel', wraplength=184).pack(side='bottom', anchor='w', pady=(20, 0))
        panel_scroll = CanvasScroll(scroll)
        def wheel(event):
            panel_scroll.wheel(event)
            return 'break'
        for child in [scroll, content, *content.winfo_children()]:
            if child.winfo_class() != 'TSpinbox':
                for event in ('<MouseWheel>', '<Button-4>', '<Button-5>'):
                    child.bind(event, wheel)
    app.show_tool_panel = show_panel
    for name, (symbol, _, _) in groups.items():
        button = tk.Button(rail, text=symbol+'\n'+name, font=('Segoe UI', 10), background='#faf9fc', foreground='#686374', activebackground='#eee7ff', activeforeground=PURPLE, relief='flat', borderwidth=0, cursor='hand2', pady=7, command=lambda n=name: show_panel(n))
        button.pack(fill='x', padx=5, pady=3)
        app.rail_buttons[name] = button
        for event in ('<MouseWheel>', '<Button-4>', '<Button-5>'):
            button.bind(event, scroll_rail)
    for event in ('<MouseWheel>', '<Button-4>', '<Button-5>'):
        rail_view.bind(event, scroll_rail)
    show_panel('File')


def draw_welcome(app):
    if app.pdf:
        return
    c=app.canvas
    c.delete('welcome')
    w,h=c.winfo_width(),c.winfo_height()
    cx,cy=w/2,max(130,h*.40)
    c.create_oval(cx-34,cy-98,cx+34,cy-30,fill='#e5dbf8',outline='',tags='welcome')
    c.create_text(cx,cy-64,text='▤',font=('Segoe UI',28),fill=PURPLE,tags='welcome')
    c.create_text(cx,cy+4,text='Every page, a possibility.',font=('Segoe UI',21,'bold'),fill=INK,tags='welcome')
    c.create_text(cx,cy+49,text='Open a PDF or start with a blank page.\nEdit, annotate and export — all on your device.',font=('Segoe UI',11),fill=MUTED,justify='center',width=max(240,w-70),tags='welcome')
