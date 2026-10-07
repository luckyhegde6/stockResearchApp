# Deterministic Source Acquisition

## Principle

Everything up to `analysis-prompt.txt` is deterministic. No language model is required or invoked.

### Tools

- **webfetch**: Node's native `fetch()` through `src/lib/webfetch.ts` for public HTTP resources.
- **Playwright CLI**: browser navigation, dynamic rendering, accessibility/DOM extraction, link discovery and screenshots.
- **Scripts**: TypeScript code converts captured content into JSON/text manifests and evidence files.
- **Microsoft MarkItDown**: deterministic conversion of downloaded documents to Markdown.

## Six evidence groups

| Required evidence | Acquisition path | LLM? |
|---|---|---:|
| Annual reports | NSE page → exposed PDF links → download | No |
| MDA | MarkItDown annual-report conversion → section extraction | No |
| Concall transcripts | Screener links → PDF download; Tijori fallback | No |
| 1D technical chart | TradingView + Playwright screenshot | No |
| Fundamental snapshot | Screener tables/text → deterministic JSON | No |
| Shareholding pattern | NSE shareholding page → text/CSV links; BSE fallback | No |

## Execution

```bash
npm run research -- RELIANCE
```

The command stops at the AI boundary after producing:

```text
research/RELIANCE/analysis-prompt.txt
```

The only command that calls an LLM is:

```bash
npm run analyze -- RELIANCE
```

For convenience the two phases can be combined:

```bash
npm run research -- RELIANCE --analyze
```

Even in that mode, the LLM is called only after acquisition and MarkItDown ingestion have finished.

## Access and compliance

Use only content available through normal public HTTP/browser access. Do not bypass CAPTCHA, login restrictions, paywalls, rate limits or anti-bot controls.

## v1.15 Deterministic evidence boundary

The acquisition layer remains LLM-free. Source acquisition -> normalization -> source health -> evidence quality -> evidence contract -> evidence bundle -> MarkItDown -> analysis prompt are all deterministic. The model is invoked only by `npm run analyze -- <TICKER>` (or the optional `--analyze` convenience flag after acquisition completes).
