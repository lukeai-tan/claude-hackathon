# OpenSlides 0.2.1

Download **OpenSlides-Setup-0.2.1-x64.exe** for an installer, or **OpenSlides-Portable-0.2.1-x64.exe** to run without installation. Windows 10/11, 64-bit. These hackathon binaries are unsigned; Windows may show a SmartScreen prompt. SHA256SUMS.txt contains the download hashes.

- Renamed the app to OpenSlides and the suite assistant to Claudia, including Ask Claudia throughout the interface. Existing saved decks and API settings are preserved.
- Canva-inspired creation sidebar and horizontal slide strip.
- Searchable original elements: shapes, lines, graphics, editable diagrams, frames, charts and tables; drag to place, favourites and recently used.
- Claudia-generated SVG elements with previews and a reusable local library.
- 20 themes, saved custom themes, 19 bundled font families and six font combinations.
- 12 starter templates, including marketing, creative, nature, team, proposal and thesis decks.
- Design agent builder with instructions, allowed tools, starter agents and JSON import/export. Agents propose elements, text rewrites, notes, themes or new slide outlines. Review and apply changes with one undo step.

Open **Ask Claudia → settings**, paste your own Anthropic API key and save. The default model is `claude-opus-5-5`, API version `2026-10-21`; both are configurable. Desktop can remember the key with OS encryption. No key is included in this release. The editor works offline; AI requires a connection and uses your Anthropic credits. Generated elements are SVG images; standard shapes and diagrams remain editable.

Browser smoke tests mock Anthropic and spend no credits. A successful build validates compilation, proposal validation, the editor flows and packaged desktop launch; it does not validate your account balance or model permissions. PowerPoint recipients need the fonts installed for exact typography.
