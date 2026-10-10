# Stock Research Pipeline CLI & Environment Reference

This document provides a comprehensive reference of all **CLI commands**, **`npm run` scripts**, **CLI flags**, and **environment variables** for the **Stock Research Pipeline** (v1.50.0).

---

## 💻 CLI Subcommands (`src/index.ts`)

The primary CLI entrypoint is `src/index.ts`, invoked via `npm run <command> -- [arguments]`.

| Subcommand | Usage Example | Description |
| :--- | :--- | :--- |
| `research` | `npm run research -- RELIANCE` | Runs complete acquisition, MarkItDown normalization, canonical facts extraction, and readiness gate evaluation for a symbol. |
| `analyze` | `npm run analyze -- RELIANCE` | Executes LLM analysis over `analysis-prompt.txt` and Ajv-validates `outputs/<SYMBOL>-analysis.json`. |
| `ingest` | `npm run ingest -- RELIANCE` | Re-runs MarkItDown normalization over raw files in an existing `research/<SYMBOL>/raw/` directory. |
| `validate` | `npm run validate -- RELIANCE` | Runs Ajv schema validation check on `outputs/<SYMBOL>-analysis.json`. |
| `prompt` | `npm run prompt -- RELIANCE` | Prints the path and content preview of `analysis-prompt.txt`. |
| `research-nse` | `npm run research:nse -- RELIANCE` | Runs acquisition exclusively from NSE NextAPI and NSE Archives. |
| `research-chartink` | `npm run research:chartink -- RELIANCE` | Runs stock-level research with opt-in Chartink scans included. |
| `research-tradingview`| `npm run research:tradingview -- RELIANCE` | Runs acquisition exclusively from TradingView public symbol page. |
| `chartink-top20` | `npm run chartink:top20` | Executes top 20 momentum volume scan. |
| `chartink-market-scans`| `npm run market:scans` | Executes all long-lived Chartink market scans. |
| `nse-52week-high` | `npm run nse:52week-high` | Fetches equities touching or near 52-week highs. |
| `screener-screens` | `npm run screener-screens` | Runs Screener fundamental filter presets. |
| `tijori-market` | `npm run tijori-market` | Extracts Tijori sector breakdown dashboards. |
| `nse-market` | `npm run nse-market` | Updates NSE equity security master and index constituents. |
| `prepare-analysis` | `npm run prepare:analysis -- RELIANCE` | Assembles prompt context without running LLM inference. |
| `research-news` | `npm run news -- RELIANCE` | Aggregates headlines & evaluates financial news sentiment. |

---

## 📜 All `package.json` NPM Scripts

```json
"scripts": {
  "test:all": "tsx scripts/test-all.ts",
  "research": "tsx src/index.ts research",
  "analyze": "tsx src/index.ts analyze",
  "research:full": "tsx src/index.ts research",
  "ingest": "tsx src/index.ts ingest",
  "validate": "tsx src/index.ts validate",
  "prompt": "tsx src/index.ts prompt",
  "research:nse": "tsx src/index.ts research-nse",
  "setup:playwright": "npx playwright install chromium && npx playwright-cli install --skills",
  "playwright:doctor": "tsx src/lib/cli-doctor.ts",
  "markitdown:doctor": "tsx src/lib/markitdown-doctor.ts",
  "source:doctor": "tsx src/lib/source-doctor.ts",
  "tradingview-doctor": "tsx src/index.ts tradingview-doctor",
  "quality": "tsx src/lib/quality-check.ts",
  "version:check": "node scripts/version-check.mjs",
  "market:scans": "tsx src/index.ts market-scans",
  "chartink:top20": "tsx src/index.ts chartink-top20",
  "nse:52week-high": "tsx src/index.ts nse-52week-high",
  "research:news": "tsx src/index.ts research-news"
}
```

---

## 🌐 Environment Variables (`.env`)

| Variable Name | Default Value | Required For | Description |
| :--- | :--- | :--- | :--- |
| `LLM_ENDPOINT` | *None* | `analyze` | OpenAI-compatible endpoint URL (e.g. `https://api.openai.com/v1/chat/completions`). |
| `LLM_API_KEY` | *None* | `analyze` | API Key for LLM provider. |
| `LLM_MODEL` | `gpt-4o` | `analyze` | Model string passed to chat completions request. |
| `LLM_TIMEOUT_MS` | `120000` | `analyze` | Timeout in milliseconds for LLM HTTP call. |
| `OPENROUTER_API_KEY` | *None* | OpenRouter | Key for OpenRouter Agent SDK model calls. |
| `RESEARCH_INCLUDE_CHARTINK`| `false` | `research` | Toggle opt-in Chartink adapter for stock research. |
| `NSE_TIMEOUT_MS` | `30000` | All | Network timeout for NSE NextAPI requests. |
| `SOURCE_TIMEOUT_MS` | `45000` | All | Network timeout for external browser adapters. |
| `PLAYWRIGHT_CLI` | `npx playwright-cli`| Browser | Path/command to invoke Playwright CLI executable. |
| `MARKITDOWN_BIN` | `markitdown` | Ingestion | Path/command to invoke Microsoft MarkItDown executable. |
| `CONCALL_LIMIT` | `3` | `research` | Maximum earnings concall PDF transcripts to download. |
| `ANNUAL_REPORT_LIMIT` | `3` | `research` | Maximum annual report PDFs to download. |
| `BSE_SCRIPTS_JSON` | `./config/bse-scripts.json` | BSE | JSON mapping file for BSE scrip codes. |


## TradingView public UI surfaces

The standalone surface command is `npm run tradingview:ui -- RELIANCE`.

It captures the configured public symbol-page surfaces: `forecast,news,documents,seasonals,community`.

Surface navigation is direct Playwright page navigation. The adapter verifies the exact TradingView host/path and surface-specific visible content before marking the visual evidence `ok`.
