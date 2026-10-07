# Implementation Notes

## Architecture

```text
                npm run research -- RELIANCE
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
     webfetch          playwright-cli     filesystem
   public HTTP       dynamic/browser      + scripts
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                    raw evidence
                           │
                           ▼
                    MarkItDown CLI
                           │
                           ▼
                  normalized Markdown
                           │
                           ▼
                deterministic prompt build
                           │
                           ▼
                 analysis-prompt.txt
                           │
                    (LLM boundary)
                           ▼
                npm run analyze -- RELIANCE
                           │
                           ▼
                  final JSON + AJV check
```

## No-LLM acquisition boundary

The following modules never call an LLM:

- `src/adapters/*`
- `src/lib/webfetch.ts`
- `src/lib/download.ts`
- `src/lib/ingest.ts`
- `src/lib/manifest.ts`
- `src/lib/prompt.ts`

`src/lib/llm.ts` is imported only by the `analyze` command (or the optional `--analyze` phase after acquisition has completed).

## Deterministic evidence

Screener tables are preserved in `raw/screener/company-page.json` and copied to `raw/screener/fundamental-snapshot.json` without AI interpretation.

Annual reports, concall PDFs and other source documents remain in their original form before MarkItDown conversion.

TradingView chart evidence remains as a PNG screenshot because chart/canvas information can be visual even when DOM text is sparse.

## Reproducibility

Every artifact records:

- source provider
- source URL
- acquisition method
- retrieval timestamp
- period where detectable
- local raw path
- normalized Markdown path, when available
- screenshot path where applicable
- status
- notes/data limitations

The resulting `manifest.json` is the contract between acquisition and analysis.

## Final analysis

The final model receives:

1. `skills/stock-analysis/SKILL.md`
2. `skills/stock-analysis/ANALYSIS_PROMPT.md`
3. source artifact metadata
4. normalized evidence
5. explicit data gaps/warnings

The model returns one JSON object which is validated with AJV before being marked successful.


### Historical data
NSE historical requests are chunked and archived individually before deterministic merge/deduplication.

## v1.15 Evidence Contract

`evidence-contract.json` is generated after source-health and evidence-quality validation and before final prompt construction. `evidence-bundle.json` combines the contract, source health, evidence quality, manifest state and document paths. The final analysis prompt reads these deterministic artifacts first.
