# OpenSuite

### Professional PDF editing and AI-powered presentation design. Free, local-first, and open source.

OpenSuite brings together **OpenPDF** (re-engineering Adobe Acrobat Pro's premium PDF workflows) and **OpenSlides** (re-engineering Canva Pro's visual design workflows with native PowerPoint compatibility).

Create, edit, manipulate, and export documents and presentation decks without recurring subscription paywalls. Augment your workflow with **Ask Claudia**, an on-demand AI design co-pilot powered by the Anthropic Claude API.

**Two standalone editors. One integrated desktop workspace. Zero recurring software fees.**

[Download OpenSuite](https://github.com/lukeai-tan/claude-hackathon/releases/latest) | [Explore the Source Code](https://github.com/lukeai-tan/claude-hackathon)

## 1. The Problem: Professional Document & Design Tools Are Gated Behind Subscriptions

Everyday knowledge workers, students, and engineers face steep recurring paywalls for essential productivity tools:

* **Adobe Acrobat Pro**: Charges for in-place text editing, page reorganization, redaction, forms, and OCR.

* **Canva Pro / M365 Copilot**: Charges for structured presentation design, visual templates, auto-resizing, and AI slide generation.

Both ecosystems lock fundamental file specifications (open ISO 32000 PDF and ECMA-376 / ISO/IEC 29500 Office Open XML) behind recurring cloud subscriptions.

### Cost of the Status Quo — 20% of Judging Rubric

| Product | Monthly Equivalent | Annual Cost | Paywalled Capabilities Targeted | 
| ----- | ----- | ----- | ----- | 
| Adobe Acrobat Pro | US\$19.99 | US\$239.88 | Direct text editing, OCR, conversion, redaction, form builder, page organization | 
| Canva Pro | US\$12.00 | US\$144.00 | Template engine, drag-and-drop canvas, brand kits, AI generation, premium export | 
| **Combined** | **US\$31.99** | **US\$383.88** | **Full document editing & presentation suite** | 

*Pricing verified as of 31 October 2026 based on annual individual commitments from [Adobe Acrobat](https://www.adobe.com/acrobat/plans.html) and [Canva](https://www.canva.com/pricing/).*

### Reach of the Status Quo — 15% of Judging Rubric

These tools represent standard enterprise and academic infrastructure worldwide:

| Product | Reported Reach | Source | 
| ----- | ----- | ----- | 
| Adobe Acrobat | \~650M Monthly Active Users | [Adobe Investor Presentation, 2025](https://www.adobe.com/cc-shared/assets/investor-relations/pdfs/21305202/atrg43rwge.pdf) | 
| Canva | 260M Monthly Active Users | [Canva 2025 Year in Review](https://www.canva.com/newsroom/news/canva-2025-wrap/) | 

The opportunity: unlock these high-frequency workflows using local-first client architecture and pay-per-token API access instead of recurring seat licenses.

## 2. What We Built — 25% of Judging Rubric

OpenSuite is a unified desktop application containing two fully functional, decoupled editors sharing a common launcher:

```
┌─────────────────────────────────────────────────────────────┐
│                   OpenSuite Desktop Workspace                │
├──────────────────────────────┬──────────────────────────────┤
│           OpenPDF            │          OpenSlides          │
│   (Acrobat Pro Alternative)  │   (Canva Pro Alternative)    │
│  - In-place text editing     │  - Drag-and-drop slide canvas│
│  - PyMuPDF / Tesseract OCR   │  - Native .pptx round-trip   │
│  - Byte-level redaction      │  - Ask Claudia (AI Copilot)  │
│  - Local Word / PDF convert  │  - SVG generation & themes   │
└──────────────────────────────┴──────────────────────────────┘

```

### OpenPDF — Re-engineering Adobe Acrobat Pro

OpenPDF provides local, offline PDF manipulation without cloud reliance or account requirements:

* **Direct In-Place Editing**: Click and modify existing PDF text blocks, preserving font metrics, styling, and coordinate bounds where supported. Move, resize, search, and replace text sections directly on the canvas.

* **Structural Document Operations**: Reorder, rotate, split, merge, crop, and extract pages. Add page numbering, watermarks, and bookmarks.

* **Markup & Annotations**: Freehand vector pen drawing, text highlighting, sticky comments, hyperlinks, and image/stamp insertions.

* **Enterprise Utilities**:

  * **Permanent Redaction**: Strips underlying vector paths and character glyphs from the PDF content stream rather than merely drawing a visual black box over them.

  * **Interactive Form Engine**: Create, detect, and fill standard PDF form fields.

  * **Local OCR**: Scans image-based pages via Tesseract OCR to generate searchable, selectable text layers.

  * **Format Conversion**: Converts PDF documents into editable Word (`.docx`) files locally using `pdf2docx`.

*Stack: Python 3.12, PyMuPDF / MuPDF, Tesseract OCR, pdf2docx, PyQt/Electron.*

### OpenSlides — Re-engineering Canva Pro + PowerPoint

OpenSlides bridges the gap between Canva's visual, layout-driven design model and PowerPoint’s ubiquitous `.pptx` enterprise standard.

#### Why Existing Tools Fall Short

* **Canva exports to PowerPoint** often flatten rich slides into static background images or break text run metrics, rendering them uneditable for collaborators.

* **PowerPoint's native UI** lacks flexible visual alignment guides, fast thematic layout prototyping, and accessible generative design tools.

#### What OpenSlides Delivers

* **Intuitive Visual Canvas**:

  * Freeform drag-and-drop stage built with React, Vite, and Zustand.

  * Dynamic magnetic snapping lines, smart distribution guides, and multi-element grouping.

  * 12 hand-crafted presentation templates and 20 one-click theme presets.

  * 19 bundled offline typography families ensuring consistent cross-platform rendering.

* **True Round-Trip PowerPoint Engine**:

  * **Direct Office Open XML (OOXML) compilation**: Exports directly to editable `.pptx` presentations using native vector shapes, text frames, tables, and charts rather than flattened raster screenshots.

  * Full support for importing existing `.pptx` decks into the visual canvas.

  * Speaker notes panel and full-screen dual-monitor Presenter View.

  * Multi-format export: Editable `.pptx`, vector PDF, and high-resolution PNG slides.

* **Automated Slide Quality Linter**:

  * Real-time automated auditing checks slides for WCAG color contrast failures, illegible font sizes, and elements positioned outside the printable viewport.

* **100% Offline-First Core**:

  * All deck editing, layout computations, and file exports execute locally in the client browser or desktop sandbox with zero external network requests.

### Ask Claudia — Built-In AI Design Co-Pilot

Integrated directly into OpenSlides, **Ask Claudia** uses Anthropic's Claude API to turn plain-language instructions into structured presentation changes.

```
User Request: "Create a slide detailing the history of onions."
   │
   ▼
Ask Claudia (Claude 5.5 Sonnet / Haiku)
   │
   ▼ Strict JSON Output (Layout AST, SVG paths, Theme configs)
Client-Side Validation & Safety Sanitizer
   │
   ▼ Interactive Preview (Accept / Reject / Diff)
OpenSlides Canvas (Applied as editable vector nodes)

```

#### Capabilities & Workflows

| Capability | Mechanism | User Output | 
| ----- | ----- | ----- | 
| **Outline-to-Deck Generation** | Translates high-level prompts into multi-slide structures with distinct layout archetypes (e.g., Stat Callout, 3-Card Grid, Comparison). | Fully populated, editable slides with titles, bullet runs, and cards. | 
| **Generative Vector Graphics** | Direct-to-SVG code generation tailored to match the slide's active color palette. | Clean vector iconography and illustrations inserted directly onto the canvas. | 
| **Contextual Text Rewriter** | Analyzes selected text nodes against tone targets (e.g., "executive summary", "punchy bullet points"). | In-place text replacements preserving coordinate bounding boxes. | 
| **Dynamic Palette Synthesizer** | Proposes 5-color cohesive design themes based on mood or company branding. | Instant theme-wide palette shifts across all slide shapes and text runs. | 
| **Automated Speaker Notes** | Reads slide content and generates natural speaker talking points and transition cues. | Synced notes accessible during presentation mode. | 

*Note: Claudia requests are billed directly through the user's Anthropic API key. Core presentation editing remains 100% operational offline without an API key.*

## 3. Cost Reduction — 25% of Judging Rubric

OpenSuite replaces recurring seat licenses with an open-source, local-first foundation and pay-per-token API access:

### Before vs. After

| Expense Item | Commercial Stack (Status Quo) | OpenSuite Equivalent | Direct Savings | 
| ----- | ----- | ----- | ----- | 
| PDF Editor | US\$239.88 / year (Acrobat Pro) | **US\$0** (OpenPDF) | 100% | 
| Presentation Builder | US\$144.00 / year (Canva Pro) | **US\$0** (OpenSlides) | 100% | 
| AI Slide Assistant | Bundled / +US\$360 (M365 Copilot) | **Pay-per-token** (\~\$0.01/deck via API) | \~99% | 
| **Annual Total Per User** | **US\$383.88 / year** | **US\$0 core** + pennies for AI | **US\$383.88 / user / year** | 
| **Team of 10 Users** | **US\$3,838.80 / year** | **US\$0 core** | **US\$3,838.80 / year** | 

### Why OpenSuite Costs Less

1. **Zero Subscription Fees**: All core editing tools are free and open source under permissive and copyleft licenses.

2. **Local-First Compute**: Document parsing, layout calculation, and export rendering run on your local CPU/GPU, eliminating centralized server infrastructure overhead.

3. **Unbundled AI Consumption**: Instead of paying a flat \$20–$30/month AI markup, users bring their own Anthropic API key, paying fractions of a cent per slide generation only when used.

## 4. How We Reverse-Engineered the Workflows

### 1. Reverse-Engineering PDF Operator Streams

Standard PDF viewers treat files as a series of low-level drawing commands (`re`, `m`, `l`, `BT`, `ET`, `Tj`). OpenPDF implements a layout reconstruction pipeline:

* Clusters glyph bounding boxes into coherent words, lines, and paragraphs using spatial density heuristics.

* Intersects horizontal and vertical drawing rules to detect and reconstruct structured table grids.

* Decodes font descriptor dictionaries (`/Widths`, `/FontDescriptor`) to enable in-place character updates without breaking text flow.

### 2. Reverse-Engineering Canva's Declarative Layouts into OOXML

Canva's design speed comes from declarative element positioning, whereas PowerPoint relies on strict ISO/IEC 29500 XML schema files (`slide1.xml`, `p:spTree`, `a:xfrm`).

* OpenSlides defines a standardized **Intermediate Design AST (Abstract Syntax Tree)** representing coordinates, typography hierarchies, shape borders, and fills.

* When exporting, our OOXML generator maps this AST directly to native PowerPoint shapes (`p:sp`), text runs (`a:r`), and color schemes (`p:clrMap`), ensuring that exported decks remain fully editable inside Microsoft PowerPoint, Keynote, and Google Slides.

### 3. Sandboxing Generative AI (Ask Claudia)

Rather than letting an LLM blindly write code or generate un-editable flat images, Ask Claudia is constrained to produce strict, validated JSON matching our layout AST. Every proposal passes through a client-side structural validator and SVG sanitizer before touching the document tree.

## 5. Verification & Testing

Every layer of OpenSuite is validated through automated test suites in continuous integration:

* **OpenPDF Verification**:

  * Unit tests validating PDF byte reconstruction, page operations, and form field population.

  * True redaction tests ensuring text bytes are purged from the underlying byte stream (not just hidden visually).

  * OCR verification against multi-resolution scanned samples.

* **OpenSlides Verification**:

  * Canvas element state management and drag-and-drop coordinate math tests.

  * Round-trip `.pptx` tests: verifies that generated presentation archives unpack and parse correctly against Open XML schemas without corruption.

  * Automated linter unit tests auditing WCAG contrast ratios and boundary overflows.

* **CI/CD & Packaging**:

  * GitHub Actions pipelines execute automated unit test matrices and produce reproducible, automated Windows x64 binaries.

Check live workflow runs: [GitHub Actions Workflows](https://github.com/lukeai-tan/claude-hackathon/actions)

## 6. Open-Source Licensing — 15% of Judging Rubric

OpenSuite is distributed under OSI-approved open-source licenses:

| Sub-Project | Directory | License | Terms | 
| ----- | ----- | ----- | ----- | 
| **OpenSuite Workspace Launcher** | `source-code/main/` | **AGPL-3.0-or-later** | Full source copyleft ensuring launcher modifications remain public | 
| **OpenPDF** | `source-code/OpenPDF/` | **AGPL-3.0-or-later** | Preserves open access for document utility improvements | 
| **OpenSlides** | `source-code/OpenSlides/` | **MIT License** | Permissive, enterprise-friendly reuse and embedding | 

The root repository includes the master [LICENSE](LICENSE) file, and all third-party dependencies retain their respective open-source licenses.

## 7. Download & Installation

Binaries are compiled for **Windows x64**:

[Download the Latest OpenSuite Release](https://github.com/lukeai-tan/claude-hackathon/releases/latest)

* **`OpenSuite-Setup-x64.exe`**: Standard Windows desktop installer.

* **`OpenSuite-Portable-x64.exe`**: Standalone executable (runs immediately without installation or admin rights).

*Note: Because these hackathon builds are self-signed, Windows Defender SmartScreen may display an initial unknown publisher notice.*

## 8. Build from Source

### Prerequisites

* **Node.js**: `v20.x` or `v24.x`

* **Python**: `3.11+` / `3.12`

* **Tesseract OCR** (for OpenPDF OCR capabilities)

### 1. Run OpenSlides (Presentation Editor)

```
# Clone the repository
git clone https://github.com/lukeai-tan/claude-hackathon.git
cd claude-hackathon

# Install and launch OpenSlides
npm ci --prefix source-code/OpenSlides
npm run dev --prefix source-code/OpenSlides

```

### 2. Run OpenPDF (PDF Editor)

```
# Install Python dependencies
python -m pip install -r source-code/OpenPDF/requirements.txt

# Launch OpenPDF
python source-code/OpenPDF/app.py

```

### 3. Run Test Suites

```
npm test

```

## 9. Repository Structure

```
claude-hackathon/
├── .github/workflows/          # Automated CI/CD test and Windows build matrix
├── source-code/
│   ├── main/
│   │   ├── web/                # OpenSuite project website
│   │   └── desktop/            # Unified Electron shell & launcher
│   ├── OpenPDF/                # Python + PyMuPDF native PDF engine
│   │   ├── core/               # Layout reconstruction, redaction, and OCR
│   │   └── ui/                 # Canvas interface and toolbars
│   └── OpenSlides/             # React + Vite presentation suite
│       ├── src/
│       │   ├── canvas/         # Drag-and-drop vector stage & guides
│       │   ├── claudia/        # Ask Claudia AI agent & prompt pipelines
│       │   ├── pptx/           # Office Open XML importer/exporter
│       │   └── templates/      # Hand-crafted themes and archetypes
├── scripts/                    # Packaging and cross-compilation scripts
├── tests/                      # Integration and end-to-end test suites
├── LICENSE                     # AGPL-3.0 Root License
└── README.md

```

## 10. Summary for Hackathon Judges

| Evaluation Pillar | Weight | How OpenSuite Delivers | 
| ----- | ----- | ----- | 
| **Cost of Status Quo** | **20%** | Replaces **Adobe Acrobat Pro (\$239.88/yr)** and **Canva Pro (\$144.00/yr)**—a combined **\$383.88/year** recurring drain per user. | 
| **Reach of Old Thing** | **15%** | Targets tools with **900M+ combined monthly active users** across corporate, academic, and consumer spheres. | 
| **Coolness of Build** | **25%** | Two working software engines: in-place PDF text editing with true redaction, plus a PowerPoint-compatible visual slide builder with Claude-powered vector generation. | 
| **Cost Reduction** | **25%** | Avoids 100% of core subscription costs (\$0/year). Optional AI generation billed at wholesale token cost (\~$0.01/deck) rather than flat SaaS markups. | 
| **Open Source Licensing** | **15%** | Dual **AGPL-3.0** and **MIT** licensed codebase hosted publicly on GitHub with automated verification workflows. | 

**Built for Autonomous SG 2026 — NUS Hackers Track.**
