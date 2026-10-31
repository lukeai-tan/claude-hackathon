# OpenSlides

An open-source slide deck editor that combines Canva-style design speed with PowerPoint-grade control. It runs in the browser, works offline, and exports real, editable `.pptx` files. Free, no account, MIT licensed.

**Live app:** https://shira421.github.io/claude-hackathon/ (after GitHub Pages is enabled, see [Deploy](#deploy))

Built for Autonomous SG 2026, NUS Hackers track ("reverse engineer something expensive and make it cheap and open").

## Windows release and Studio features

OpenSlides is the slide design app in our suite. **Claudia** is its AI assistant: choose **Ask Claudia** to design with her. Existing Deckforge decks and saved desktop data remain compatible. New deck exports use `.openslides.json`.

See [Releases](https://github.com/shira421/claude-hackathon/releases) for the installer and portable `.exe`, or build on Windows:

```sh
npm ci
npm run desktop:install
npm run desktop:build
```

Files are written to `release/`. `npm run desktop:preview` launches a previously built desktop renderer. Windows builds are unsigned. The release workflow runs unit, browser and packaged launch checks before publishing a prerelease.

The creation sidebar adds 38 original elements, favourites and recents; 20 theme presets and saved themes; 19 offline font families and six pairings; 12 original templates; and reusable design agents with configurable instructions and permitted tools. Click or drag an element onto a slide. Open Properties for precise controls. Slide reordering is in the bottom filmstrip.

Open **Ask Claudia → settings** to enter an Anthropic API key. Defaults match `claude-opus-5-5` and API version `2026-10-21`. Model, version and output limit are configurable. Keys are never included in deck files, exported agents, repository code or release binaries. The browser holds a key for the current session. Desktop can optionally save it with OS encryption, or read `ANTHROPIC_API_KEY` at launch. Forget key removes the saved copy.

Each Generate click makes one billable request. Cancel stops waiting for it, but Anthropic may still bill already processed tokens. AI actions are validated and previewed; applying a proposal is one undoable edit. A deck changed during generation requires a fresh proposal. Standard shapes/diagrams are native editable elements; generated graphics are sanitized SVG image assets. Custom agents choose from element, outline, rewrite, notes and theme tools, and can be exported/imported as JSON. No background agent execution is performed.

Run `npm test` for schema and proxy checks. `scripts/browser-smoke.mjs` drives a running Vite app with Playwright and mocked Anthropic responses (no credits required); CI installs its browser dependencies separately. Additional font licences are in `public/fonts/LICENSES/`.

## The problem

Most people who make slides pay for one of two tools and work around the other's gaps.

| | Canva Pro | Microsoft 365 (PowerPoint) | OpenSlides |
|---|---|---|---|
| Price per user | about US$120 to $144 a year, depending on billing [1][2] | US$99.99 a year for Personal [3] | Free |
| Reach | roughly 170 to 230 million monthly users [4][5] | Office suite reported at over 1 billion users [6] | |
| Brand kit, magic resize, background remover, transparent export | Pro only [1][2] | Not the same workflow | Brand kit and magic resize are free (no background remover yet) |
| Real data charts, rich text, slide masters, presenter view | Reviewers note basic charts, limited animation and slide logic [7], and one text style per text box [8] | Yes | Yes |
| Works offline | No, browser-based [9] | Desktop app | Yes, installable web app |
| Learning curve | Low | Steep ribbon UI [9] | Canva-style canvas with PowerPoint controls one click away |

Prices and user counts are third-party figures as of 2026. They vary by country and billing, so treat them as approximate.

**The saving:** a student or small team paying for both tools spends roughly US$220 to $245 per person each year. OpenSlides does the core slide workflow of both for US$0, and exports the standard `.pptx` format that other slide apps open (we verified the export in python-pptx and LibreOffice).

## What we rebuilt, and how

We studied what each product does well, what it hides behind a paywall, and where reviewers say it falls short, then rebuilt the slide-making core as open code. We did not decompile or copy either product, and the app uses no Canva or Microsoft assets, templates or code.

**From Canva**
- Drag-and-drop canvas with smart guides that snap to slide edges, centres and other items
- Corner-drag scales text along with its box
- Brand kit: 7 brand colours, heading and body fonts and a logo. Colours and fonts are stored as references, so changing the brand updates every slide at once
- Magic resize: re-fits a whole deck to 16:9, 4:3, A4, square, 4:5 or 9:16, as a copy or in place
- Drop or paste images straight onto the slide; image placeholders accept drops
- Starter templates (all original)

**From PowerPoint**
- Slide masters ("layouts") with real placeholder inheritance. Move or restyle a placeholder in a layout and every slide follows, unless that slide overrides it. Overrides are shown in the inspector, with a reset button
- Rich text with mixed formatting in one box: bold, italic, underline, strikethrough, colour, size, font, alignment, bulleted and numbered lists
- Charts driven by a data grid (paste from Excel, Sheets or CSV). They export as native PowerPoint charts you can keep editing
- Tables with header rows and banded rows, exported as native tables
- Entrance animations (on click, with previous, after previous) and slide transitions
- Presenter view: current slide with builds, next slide, notes with adjustable size, timer and clock. Slides open in a second window kept in sync
- Align, distribute, group, lock, layer order, undo/redo, full keyboard shortcuts

**Reading PowerPoint's own file format**
- Open a `.pptx` from the home page. A `.pptx` is a zip of XML parts (Office Open XML); `src/io/importPptx.ts` decodes it: slide size, theme colours and fonts, text with per-run bold, italic, colour, size and bullets, placeholders that inherit position from their layout and master, pictures, shapes, connectors, groups, native tables, native charts (series, categories, colours, value labels), backgrounds and speaker notes
- Anything it can't carry over (SmartArt, video, EMF/WMF images, custom geometry) is listed in a message after import, so nothing disappears silently
- Round trip: a deck exported from OpenSlides re-imports with its text, colours, charts and notes intact

**Things neither does by default**
- **Deck check**: on every change, without AI, it flags low contrast (WCAG 2.1 ratios against the actual colour behind the text), text under 12 pt, items off the slide, images without alt text, wordy slides and too many fonts. Several issues have a one-click fix
- **Outline mode**: type `#`, `##`, `-`, `---` and `>` to generate slides (with notes) from plain text, or pull the current deck back out as an outline
- **Offline by default**: decks live in IndexedDB on your device. Explicit AI requests send the prompt, current slide text/notes and theme settings to Anthropic; images are not sent.

## How it works

- React + TypeScript + Vite, state in Zustand with Immer patches for undo/redo
- Slides are a JSON document model (`src/model/types.ts`). Colours and fonts can be literal values or theme references like `theme:primary`, which is what makes the brand kit propagate
- Layout inheritance: a slide element linked to a layout placeholder takes geometry and style from the layout until the user overrides either one (`src/model/resolve.ts`)
- One renderer (`src/render/SlideView.tsx`) draws the editor, thumbnails, slideshow and image/PDF export, so they always match
- PPTX export (`src/io/export.tsx`) maps text to real text boxes with per-run formatting and bullets, shapes to native shapes, charts to native charts, tables to native tables, and notes to speaker notes. Images are baked with their crop, filters and rounded corners so PowerPoint shows what the editor shows
- Fonts are bundled locally (19 open-licence families), so offline use and PDF/PNG export render correctly
- `src/ai/` validates Claudia proposals for SVG elements, outlines, rewrites, notes and themes. `src/studio/` provides the galleries and agent builder. The Electron main process holds the desktop API key and sends requests to the fixed Anthropic endpoint. Editing works without AI.

## Testing and limits

What we checked, with a headless Chrome script driving the real UI:
- Creating decks from every template, selecting, dragging with snapping, resizing, rotating, editing text, inline formatting (bold, colour, size, font) while editing, undo
- Inserting charts (data dialog) and tables, changing themes, editing a layout and seeing it propagate to every slide using it
- Image upload, copy and paste between slides, outline-to-slides, magic resize to square, presenter view with a synced audience window
- Import: a deck generated by python-pptx (title and bullet placeholders with no explicit position, a bold red run, a nested bullet, a column chart, a table, a rounded rectangle with text, a photo, speaker notes) imports with all of those intact; so does OpenSlides's own `.pptx` export
- Export: the `.pptx` from the pitch template opens in python-pptx with 7 slides, native charts, a native table and speaker notes, and renders correctly in LibreOffice. PDF export produces one page per slide with fonts embedded
- The production build works under a sub-path and keeps working after going offline

Where it falls short today:
- `.pptx` import covers common content, not everything: SmartArt, video, animations, EMF/WMF images, image cropping and theme colour tints beyond lighten/darken are skipped or approximated, and imported slides use a blank layout rather than recreating the original masters
- Animations and transitions play in OpenSlides's slideshow but are not written into the `.pptx`
- People opening an exported `.pptx` need the deck's fonts installed, or PowerPoint substitutes them
- No real-time collaboration, comments or cloud sync
- No stock photo library and no background remover
- Tested in Chrome. Editing relies on `contentEditable`, so other browsers may behave differently
- The deck check estimates the colour behind text from shapes and backgrounds; text over photos is skipped rather than guessed

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
```

## Deploy

The included workflow (`.github/workflows/deploy.yml`) builds the app and publishes it to GitHub Pages on every push to `master`. Turn it on once in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Any static host works too: run `npm run build` and serve `dist/`. Set `BASE_PATH` if the app is not served from the domain root.

## Keyboard shortcuts

Press `?` in the editor for the full list. The main ones: `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, `Ctrl+D` duplicate, `Ctrl+G` group, `Ctrl+L` lock, arrows nudge, `Enter` edits the selected text, `Ctrl+Enter` presents from the current slide. In a slideshow: arrows or click to advance, `B` black screen, `F` full screen, `Esc` to exit.

## Licence

MIT. See [LICENSE](LICENSE). Bundled fonts are under the SIL Open Font License via Fontsource.

## Sources

1. [Canva pricing 2026, Pro-only features (Carly)](https://www.usecarly.com/blog/canva-pricing/)
2. [Canva Free vs Pro pricing, verified March 2026 (SaaS Price Pulse)](https://www.saaspricepulse.com/compare/canva-free-vs-pro)
3. [Microsoft 365 plans in 2026 (Office Watch)](https://office-watch.com/2026/microsoft-365-plans-overview/)
4. [Canva company profile and pricing (CostBench)](https://costbench.com/software/design/canva)
5. [Canva pricing guide (Style Factory)](https://stylefactoryproductions.com/blog/canva-pricing)
6. [The impact and reach of PowerPoint (Indezine)](https://blog.indezine.com/2024/07/the-impact-and-reach-of-powerpoint.html)
7. [Canva vs PowerPoint 2026 (WPS)](https://www.wps.com/blog/canva-vs-powerpoint-which-wins-for-presentations-a-powerful-alternative/)
8. [Canva design limitations for presentations (The PowerPoint Blog)](https://thepowerpointblog.com/?p=12906)
9. [Canva vs PowerPoint limitations (SlideEgg)](https://www.slideegg.com/blog/industry-information/canva-vs-powerpoint-which-should-you-use-in-2026/)
