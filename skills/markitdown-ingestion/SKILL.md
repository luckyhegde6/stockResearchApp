# MICROSOFT MARKITDOWN INGESTION SKILL

Use Microsoft MarkItDown to normalize downloaded research documents into Markdown before analysis.

## Supported workflow

PDF/DOCX/XLSX/PPTX/HTML/etc.

```text
raw document
     ↓
  markitdown
     ↓
normalized markdown
     ↓
section extraction
     ↓
analysis evidence
```

## CLI

```bash
markitdown input.pdf -o output.md
```

## Rules

- Preserve the original raw file.
- Store the normalized Markdown next to the evidence pack.
- Do not treat extracted Markdown as a primary source by itself; retain the originating URL and file.
- For scanned PDFs, use an alternate extraction path only when necessary and mark OCR-derived content as lower confidence.
- Detect MDA/business-review sections from annual reports rather than assuming they are separate files.
- Never silently repair numbers that appear malformed after conversion.
