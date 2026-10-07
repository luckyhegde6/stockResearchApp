# Stock Research Pipeline v1.50.0

Deterministic NSE-first individual-stock evidence pipeline with Screener, Tijori, TradingView and Chartink, followed by an explicit analysis-readiness gate.

## Start here

- [Onboarding guide](docs/ONBOARDING.md) for local setup and the first research run.
- [Documentation index](docs/INDEX.md) for architecture, CLI, evidence and testing references.
- [GitHub Pages overview](https://luckyhegde6.github.io/stockResearchApp/) for a static project introduction. The interactive control center remains local because it requires the pipeline's API server.

> This project produces research evidence and analysis inputs. It does not provide investment advice.


## v1.22 market-wide extraction reliability

v1.22 fixes public UI acquisition for Chartink and Tijori. Chartink now uses the visible Copy -> Table -> OK workflow and captures real CSV downloads; Tijori quarterly results now use the public Show More flow and the macro/sector collector uses the Ideas Dashboard. See [the v1.22 reliability note](docs/archive/releases/V1.22_PUBLIC_UI_EXTRACTION_RELIABILITY.md).

## v1.46 — symbol-agnostic individual research

The individual-stock engine resolves the requested instrument against the official NSE `EQUITY_L` security master.

Accepted examples:

```text
ITC
NSE:ITC
ITC.NS
https://in.tradingview.com/chart/?symbol=NSE%3AITC
COALINDIA
```

The default research source set is intentionally minimal:

```text
NSE + Screener + Tijori + TradingView
```

Chartink stock-level acquisition is opt-in:

```dotenv
RESEARCH_INCLUDE_CHARTINK=false
```

Long-lived Chartink market scans remain separate under `scans/`.

## v1.46 debug classification

Each research run records a run ID and per-source summaries under:

```text
research/<SYMBOL>/debug/sources/
```

BSE is excluded from production research.

# Stock Research Pipeline — deterministic acquisition + final LLM analysis

This version deliberately separates **evidence acquisition** from **AI analysis**.

The acquisition phase does not require an LLM. It uses:

- Node `fetch()` as the deterministic `webfetch` path for public HTTP content.
- `playwright-cli` for JavaScript-rendered pages, link discovery, tables, screenshots and chart evidence.
- Microsoft MarkItDown to normalize downloaded PDFs/HTML/DOCX/XLSX/PPTX into Markdown.
- TypeScript scripts to assemble the manifest, source matrix, MDA extraction and analysis prompt.

The **only stage that needs an LLM is the final `analyze` command**.

## Commands

### 1. Acquire and normalize evidence — NO LLM

```powershell
npm install
npx playwright-cli install --skills
npx playwright-cli install-browser
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install "markitdown[all]"

Copy-Item .env.example .env

npm run research -- RELIANCE
```

This creates:

```text
research/RELIANCE/
├── acquisition-report.json
├── manifest.json
├── analysis-prompt.txt
├── raw/
│   ├── annual-reports/
│   ├── concalls/
│   ├── shareholding/
│   ├── screener/
│   ├── tijori/
│   ├── tradingview/
│   ├── nse-quote.json
│   └── *.html / *.json / *.txt
├── markdown/
│   ├── ALL_EVIDENCE.md
│   ├── STRUCTURED_EVIDENCE.md
│   ├── MDA_EVIDENCE.md
│   └── ...
├── screenshots/
│   ├── nse-annual-reports.png
│   ├── nse-shareholding.png
│   ├── screener-company.png
│   ├── tijori-company.png
│   ├── tradingview-1d.png
│   └── bse-quote.png
└── ...
```

### 2. Run the final AI analysis — LLM only here

```powershell
npm run analyze -- RELIANCE
```

This reads the already-generated `analysis-prompt.txt` and `SKILL.md`, calls the configured OpenAI-compatible endpoint, validates the returned JSON and writes:

```text
outputs/RELIANCE-analysis.json
```

### 3. One-command convenience

```powershell
npm run research -- RELIANCE --analyze
```

This is still architecturally two phases inside one command:

```text
ACQUIRE → NORMALIZE → BUILD PROMPT → FINAL LLM ANALYSIS
```

No model is used before the final analysis call.

## What each source adapter does

### NSE

- Direct `fetch()` of public annual-report/shareholding pages as an HTTP fast path.
- `playwright-cli` fallback for dynamic rendering.
- Discovers exposed annual-report PDF links instead of inventing URLs.
- Captures quote metadata and screenshots.
- Captures latest shareholding page text and any exposed CSV links.

### BSE

- Direct HTTP fetch of the quote page.
- Playwright capture of visible quote/filing evidence.
- Downloads exposed annual-report PDFs when present.
- Uses configured BSE scrip mapping for deterministic URL construction.

### Screener

- Direct HTTP fetch of the public company page.
- Playwright capture of page text and tables.
- Writes `fundamental-snapshot.json` directly from visible tables/text — no model inference.
- Discovers and downloads visible concall PDFs.

### Tijori Finance

- Direct HTTP fetch of the public company page.
- Playwright capture for dynamic content.
- Discovers visible conference-call PDFs and downloads them when exposed.
- Preserves supplementary financial/conference-call context.

### TradingView

- Playwright capture of the 1D symbol page.
- Playwright screenshot of the chart.
- Playwright capture of the technicals page.
- Direct public symbol-page capture for forecast, news, documents, seasonals, and community.
- Surface URLs are generated centrally in src/lib/tradingview-url.ts; production capture does not click the Metrics/More launcher.
- Surface screenshots are retained as supplementary visual evidence for the final analyst.

## MarkItDown

Every downloaded document is retained in `raw/` and converted to Markdown under `markdown/`.

The originating URL and retrieval metadata remain in `manifest.json` so the normalized Markdown is auditable.

## Important distinction

The application does **not** ask an LLM to:

- find annual reports
- click through exchange pages
- discover PDFs
- scrape Screener metrics
- find concalls
- fetch Tijori context
- capture TradingView screenshots
- convert PDFs to text
- construct the research evidence package

Those are deterministic acquisition/ingestion jobs.

The LLM is used only for the final interpretation of the collected evidence.

## Access rules

Do not bypass CAPTCHA, paywalls, authentication, rate limits or anti-bot controls. When a source cannot be collected through its normal public/browser flow, record the source as a gap and continue with permitted alternatives.

## NSE acquisition architecture (v1.3)

NSE quote/trade/results/announcements/corporate-actions/historical data are acquired through the deterministic NSE API client. Playwright is restricted to annual-report and shareholding filing discovery/extraction, with the quote webpage used only as an audit screenshot when the primary quote API is unavailable.

The Playwright resolver supports local `node_modules/.bin/playwright-cli`, `npx --no-install`, and an optional ephemeral `npx --package=@playwright/cli@latest` fallback. See `NSE_PIPELINE.md`.


## Windows Playwright

See `PLAYWRIGHT_WINDOWS.md` for the Windows-safe CLI launcher and browser diagnostic flow.

## Windows + Node 24 runtime
The application runtime uses `playwright@1.62.1` directly. The Playwright CLI remains available for manual use and skills, but research acquisition does not spawn the CLI daemon. See `PLAYWRIGHT_NODE24_WINDOWS.md`.

## v1.10 NSE acquisition fixes

1.10 improves quote fallbacks, filters annual-report candidates to actual PDFs, and excludes generic shareholding metadata endpoints. See `NSE_ACQUISITION_FIX_1.10.md`.

## Acquisition debugging

Run the NSE acquisition normally:

```cmd
npm run research:nse -- RELIANCE

npm run research:chartink -- RELIANCE
```

For a debug-focused invocation:

```cmd
npm run research:nse:debug -- RELIANCE
```

The command prints checkpoint logs to the console and writes:

```text
research/RELIANCE/debug/acquisition-debug.json
research/RELIANCE/debug/acquisition-debug.jsonl
research/RELIANCE/debug/acquisition-timeline.txt
```

For historical-data validation:

```text
research/RELIANCE/raw/nse-api/historical-validation.json
```

Paste the terminal output plus `acquisition-debug.json` when asking for help diagnosing a run.

## v1.12 historical acquisition improvement

Three-year NSE historical data is fetched in bounded, overlapping chunks, then merged/deduplicated and coverage-validated. See `NSE_HISTORICAL_CHUNKING.md`.

## v1.14 deterministic source health and evidence quality

A full run now creates:

- `manifest.json`
- `source-health.json`
- `evidence-quality.json`
- `markdown/ALL_EVIDENCE.md`
- `markdown/STRUCTURED_EVIDENCE.md`
- `markdown/MDA_EVIDENCE.md`
- `analysis-prompt.txt`

Source-health distinguishes `ok_with_fallback` from missing data. Evidence-quality verifies that expected fields/content were actually captured before the LLM is called.

The TradingView area also contains `raw/tradingview/technical-normalized.json`. Its EMA50, EMA200 and RSI14 values are deterministically calculated from the canonical NSE EQ history, while TradingView remains the independent visual/audit source.

## v1.15 Normalization & Evidence Contract

After source acquisition, the pipeline creates:

```text
research/<TICKER>/
├── manifest.json
├── source-health.json
├── evidence-quality.json
├── evidence-contract.json
├── evidence-bundle.json
├── markdown/
│   ├── ALL_EVIDENCE.md
│   ├── STRUCTURED_EVIDENCE.md
│   └── MDA_EVIDENCE.md
└── analysis-prompt.txt
```

Use `npm run normalize -- RELIANCE` to regenerate deterministic derived evidence, the contract, and the bundle from an existing manifest.

### v1.15 commands

```cmd
npm run research -- RELIANCE
npm run normalize -- RELIANCE
npm run evidence:contract -- RELIANCE
npm run bundle -- RELIANCE
npm run analyze -- RELIANCE
```

The first four commands are deterministic. The LLM is invoked only by `analyze` (or the optional acquisition `--analyze` convenience flag).

## v1.19 — Screener market-wide screens

Collect the configured Screener screens into `research/market-screens/screener/` using the UI Export workflow when available:

```cmd
npm run research:screener-screens
```

To include them during a ticker research run:

```cmd
npm run research -- RELIANCE --with-market-screens
```


## Screener market-wide screens (v1.19)
Export is intentionally disabled. Public screen result pages are crawled with `?page=N` pagination and stored separately under `research/market-screens/screener/`.


## v1.20 Tijori market datasets

Optional market-wide Tijori collection is available with `npm run research:tijori-market` or as part of ticker research with `npm run research -- RELIANCE --with-tijori-market`. The datasets are stored under `research/market-screens/tijori/` and do not require login or export.

## v1.21 Chartink Copy workflow
Chartink market-screen acquisition now prioritizes the public `Copy -> Table -> OK` workflow, saves clipboard table text, and attempts the visible CSV download button. Each strategy uses a fresh Playwright page to prevent page lifecycle failures from cascading across the configured strategy list.

## v1.26 — NSE Market Universe

Run the market-wide NSE collector with live equity symbol discovery, complete index-list capture, NIFTY 50/500 index data, and sequential one-by-one equity quote acquisition:

```cmd
npm run research:nse-market -- ITC
```

Use `NSE_MARKET_MAX_SYMBOLS` for a smoke test and `--with-nse-market` to include the market universe in a full ticker research run. See [the v1.26 NSE market-universe note](docs/archive/releases/V1.26_NSE_MARKET_UNIVERSE.md).

## v1.26 — NSE Market Universe

Collect the NSE live-equity symbol universe, all NSE index names, NIFTY 50/500 constituents, and one-by-one equity quote data:

```cmd
npm run research:nse-market -- ITC
```

See [the v1.26 README](docs/archive/readmes/README_V1.26.md) and [the v1.26 NSE market-universe note](docs/archive/releases/V1.26_NSE_MARKET_UNIVERSE.md).

## v1.35 — NSE securities master

`data/EQUITY_L.csv` is a preserved snapshot of the official NSE Securities Available for Trading equity-segment CSV. It is used as the deterministic security master for ticker/company validation and query resolution.

Commands:

- `npm run nse:securities`
- `npm run nse:lookup -- ITC`
- `npm run nse:validate-symbol -- ITC`
- `npm run refresh:nse-securities`
- `npm run test:nse-securities`

The snapshot is the user-supplied official NSE CSV. Refreshing it uses the official NSE archive URL and regenerates the normalized JSON plus metadata.

## v1.41 — Individual Stock Evidence Completeness
The current deterministic stock package is organized under `research/<TICKER>/normalized/` into identity, market, fundamentals, financial periods, valuation, ownership, technicals, screening, catalysts, canonical values, reconciliation and analysis inputs. `npm run analyze -- TICKER` orchestrates acquisition through readiness and only then invokes the LLM. Chartink no-results are informational and BSE is excluded from production evidence.

### v1.41 core evidence completeness
The six blocking individual-stock evidence domains are fundamentals, valuation, period-aware financials, ownership, catalysts and technicals. Instrument identity is mandatory separately. Missing core evidence remains a readiness blocker; scanner no-results are informational and BSE is excluded.

## v1.44 NSE NextApi evidence

Run `npm run test:nse-nextapi-expanded` to verify the reusable endpoint registry. The normal individual-stock flow uses these NextApi endpoints automatically and stores them by family under `research/<SYMBOL>/raw/nse-api/nextapi/`. See [the v1.44 NextApi evidence note](docs/archive/releases/V1.44_NSE_NEXTAPI_EVIDENCE.md).

## Individual research: Chartink optional

```dotenv
RESEARCH_INCLUDE_CHARTINK=false
```

Minimal stock research:
```text
NSE + Screener + Tijori + TradingView
```

Enable Chartink only when strategy membership is needed:
```dotenv
RESEARCH_INCLUDE_CHARTINK=true
```

Market-wide Chartink scans remain separate under `scans/` and are not disabled by the stock-level flag.

## v1.48 news and sentiment

Individual stock research now includes supplementary deterministic headline news and sentiment. Run `npm run research:news -- SYMBOL` for the standalone stage or use `npm run analyze -- SYMBOL` for the full pipeline. News does not block analysis when feeds are unavailable.

## v1.48 News and Market Sentiment

The stock-level research pipeline now captures symbol-filtered TradingView News Flow, optional Google News RSS discovery and already-acquired NSE corporate announcements. It creates `normalized/news-sentiment.json` using deterministic headline-level sentiment. The final reasoning prompt must corroborate sentiment with primary evidence.
