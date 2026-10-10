# StockResearchApp Wiki

This documentation explains the Google Sheets publishing system, Apps Script receiver, consolidated research-sheet design, screenshot evidence pipeline, and the reasoning behind the architecture.

## Documentation map

| Page | Purpose |
|---|---|
| [Google Sheets Setup](Google-Sheets-Setup.md) | End-to-end Google Sheet and Apps Script setup |
| [Architecture & Reasoning](Google-Sheets-Architecture-and-Reasoning.md) | Why the integration is designed this way |
| [Research & Reasoning](Research-and-Reasoning.md) | How research evidence, conflicts, quality and reasoning are represented |
| [Screenshot Evidence](Screenshot-Evidence-Pipeline.md) | Screenshot optimization, embedding and failure handling |
| [Operations & Troubleshooting](Operations-and-Troubleshooting.md) | Doctor checks, exports, failures and recovery |
| [Data Contract](Google-Sheets-Data-Contract.md) | Consolidated sheet sections and field semantics |

## Current architecture

A research run follows this high-level path:

`source acquisition → normalized artifacts → deterministic evidence → research findings → consolidated transformer → Apps Script → Google Sheet`

The home/local filesystem remains the source of truth. Google Sheets is a published research/readability surface, not the canonical storage layer.

## Core principles

1. **One research/analysis run = one consolidated sheet tab.**
2. **The workbook index is navigation, not a second data warehouse.**
3. **Local command-run/audit records remain local.**
4. **Screenshots are visual evidence, not numeric truth.**
5. **Structured sources and deterministic calculations provide numeric facts.**
6. **Conflicts are preserved rather than silently resolved.**
7. **Analysis readiness must not be bypassed merely to make the sheet look complete.**
8. **Published rows must not contain local filesystem paths.**
9. **Apps Script validates screenshot payloads defensively even though the Node exporter already optimizes them.**
10. **A Sheets failure must not invalidate locally saved research.**

## Current implementation status

The implementation is on the `init` branch and covered by PR #1.

Deterministic CI has passed:

- `npm run version:check`
- `npm run typecheck`
- `npm run test:all`

The remaining live verification is deployment-specific: the current Apps Script must be redeployed as service version 2, then `npm run sheets:doctor` and a fresh HDFCBANK export should be run.
