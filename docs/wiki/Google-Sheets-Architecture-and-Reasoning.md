
# Google Sheets Architecture & Reasoning

This page describes the export architecture. Repository docs and source code are canonical; [the documentation index](README.md) lists current references.

## Data flow

`research artifact → classified transformer → path/secret sanitizer → payload preflight → Apps Script receiver → consolidated research or analysis tab`

The home/local filesystem remains the source of truth. Google Sheets is a published view, not canonical storage. Publishing failure does not invalidate local research.

## Key design boundaries

- Facts and deterministic calculations preserve source artifact IDs/URLs.
- Interpretation is distinguished from sourced facts.
- Screenshots are optional visual evidence, never a numeric source.
- Remote status must be verified separately from local generation.
- Receiver and exporter enforce size limits; live Apps Script version still needs deployment verification.
- Idempotency/retry and complete mock-receiver integration remain backlog work.

See [Data Contract](Google-Sheets-Data-Contract.md), [Setup](Google-Sheets-Setup.md), and [Operations](Operations-and-Troubleshooting.md).
