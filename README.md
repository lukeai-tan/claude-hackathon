# OpenSuite

A local-first creative suite for documents and presentations. The Windows app includes **OpenPDF** and **OpenSlides**, with a shared home, purple workspace styling and **Ask Claudia** in OpenSlides.

[Download Windows apps](https://github.com/RishabhShenoy03/claude-hackathon/releases/latest) · [Homepage source](source-code/main/web/index.html)

## Install

Download **OpenSuite-Setup-0.3.0-x64.exe** for an installer, or **OpenSuite-Portable-0.3.0-x64.exe** to run without installing. Both include both editors; no Python, Node.js or separate downloads are needed. Standalone OpenPDF and OpenSlides executables are also provided. These hackathon builds are unsigned; Windows may show a publisher warning.

OpenSuite's home opens each installed editor. The website offers downloads and opens the browser version of OpenSlides. OpenPDF runs as a native Windows app, not in a browser. Offline document editing does not require an account. Claudia generation requires internet access and your own Anthropic API key, configured in OpenSlides settings; no key is embedded in the source or release.

## Source layout

| Directory | Purpose |
| --- | --- |
| `source-code/main/web` | Suite homepage, app cards and downloads |
| `source-code/main/desktop` | Electron launcher and bundled-app routing |
| `source-code/OpenPDF` | Native PDF editor and regression tests |
| `source-code/OpenSlides` | Presentation editor, Claudia, fonts, elements and desktop shell |
| `scripts` | Suite builds and browser verification |
| `.github/workflows/windows.yml` | Tests, Windows release and website deployment |

OpenPDF retains text/box editing, ink, annotations, redaction, forms, page management, Word export and English OCR. Its refreshed workspace adds a category rail, tool panel, page previews, document/save status and fit-to-page. OpenSlides includes editable templates, themes, bundled fonts, standard elements, AI-generated SVG elements and configurable Claudia agents.

## Develop and build

Use Node.js 24 and Python 3.12. From the repository root:

```sh
npm ci --prefix source-code/OpenSlides
npm run dev --prefix source-code/OpenSlides
python -m pip install -r source-code/OpenPDF/requirements.txt
python source-code/OpenPDF/app.py
npm test
npm run build:web
```

Serve `site/` with a static web server to preview the suite and browser editor. For the public website, a repository owner must first choose **Settings → Pages → Source: GitHub Actions**, then rerun the workflow. It publishes to `https://rishabhshenoy03.github.io/claude-hackathon/`. The homepage is always available inside the desktop suite and as the `OpenSuite-website` workflow artifact. For Windows packages, install Tesseract OCR, then:

```powershell
./source-code/OpenPDF/build-windows.ps1
npm run desktop:install --prefix source-code/OpenSlides
npm run desktop:build --prefix source-code/OpenSlides
npm run build:desktop
```

Suite executables appear in `release/`; standalone apps appear in their component's `dist/` or `release/`. The suite reuses one Electron runtime for its home and OpenSlides, and bundles the native OpenPDF executable. Each standalone app remains independently buildable. OpenSuite uses its own local profile; export/import a presentation file to transfer work from an existing standalone OpenSlides installation.

## Verification

The release workflow runs OpenPDF engine, GUI and performance tests; OpenSlides unit and browser interaction tests; homepage navigation/mobile checks; and packaged Windows launch checks. The suite test opens its real bundled OpenSlides window and runs the bundled OpenPDF executable's regression checks. AI tests use mocked provider responses and do not spend API credits. Screenshots, logs and checksums are retained as workflow artifacts.

OpenPDF and the suite launcher are AGPL-3.0-or-later; OpenSlides retains MIT licensing. See [third-party notices](THIRD_PARTY.md) and each component's license.
