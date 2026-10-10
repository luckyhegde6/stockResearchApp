# PLAYWRIGHT RESEARCH SKILL

Use `playwright-cli` for browser-mediated source acquisition and visual evidence.

## Required workflow

1. Open the source URL.
2. Wait for dynamic content to settle.
3. Capture an accessibility snapshot or structured text.
4. Discover links rather than hard-coding hidden DOM details where possible.
5. Capture a screenshot for charts and filing pages.
6. Preserve the source URL and retrieval timestamp.
7. Download only content exposed through the normal page/browser flow.

## Useful commands

```bash
playwright-cli open <url>
playwright-cli snapshot
playwright-cli screenshot --full-page --filename=<file>
playwright-cli eval "() => document.body.innerText"
playwright-cli run-code --filename=<script.js>
playwright-cli network --filter="api"
playwright-cli state-save <file>
```

Use a named session for multi-step research so navigation state is retained.

## Research rules

- Re-snapshot after navigation because refs are page-state dependent.
- Prefer visible/accessible page content and links.
- Use `run-code` only for structured extraction that is awkward with refs.
- For canvas/chart evidence, prefer screenshots.
- Inspect network calls only to understand page behavior; do not defeat access controls.
- Never bypass CAPTCHA, paywalls, login restrictions, rate limits or anti-bot protections.
- If a source is blocked, record a data gap and continue with a permitted primary/secondary source.
