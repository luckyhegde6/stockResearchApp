# Stock Research Pipeline Adapters Catalog

This catalog documents all **12 source adapters** located in `src/adapters/`, detailing their responsibilities, data extraction mechanisms, Playwright session rules, output artifacts, and error handling strategies.

---

## 🔌 Catalog Summary Table

| Adapter File | Source Name | Primary Purpose | Execution Mode |
| :--- | :--- | :--- | :--- |
| `nse.ts` | National Stock Exchange | Official quote, announcements, shareholding, annual report links. | NextAPI / Fetch + Playwright |
| `screener.ts` | Screener.in | Fundamental ratios, 10-year P&L, balance sheet, cash flow, concalls. | Playwright + Fetch |
| `tijori.ts` | Tijori Finance | Product revenue breakdown, sector metrics, operational KPIs. | Playwright |
| `tradingview.ts` | TradingView | 1D technical chart screenshot and public symbol page structure. | Playwright |
| `chartink.ts` | Chartink | Custom technical scan criteria and table extractions (opt-in). | Playwright (Table Copy) |
| `bse.ts` | Bombay Stock Exchange | Fallback scrip quote & filings (excluded from prod research). | Playwright |
| `news-sentiment.ts` | Financial News | Headline scraping & sentiment polarity calculation. | Fetch / Playwright |
| `screener-market-screens.ts` | Screener Screens | Fundamental sector-wide filter screens. | Playwright |
| `tijori-market-screens.ts` | Tijori Dashboards | Industry dashboards & market sector ideas. | Playwright |
| `nse-market-universe.ts` | NSE Universe | Market-wide NSE security master & index constituent scraping. | NextAPI / Fetch |
| `nse-52week-high.ts` | NSE 52W Highs | Real-time 52-week high price breakout scraper. | NextAPI / Fetch |
| `tradingview-symbol-snapshot.ts` | TradingView Snapshot | Light 1D snapshot for quick technical triage. | Playwright |

---

## 🛠️ Adapter Deep Dives

### 1. `src/adapters/nse.ts` (NSE Adapter)
- **Functions**: `runNse(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Calls `nse-nextapi-client.ts` to fetch quote, corporate announcements, shareholding, and equity master record.
  2. Resolves official annual report PDF download links from NSE Archives.
  3. Uses Playwright fallback if direct API returns HTTP 403 / anti-bot challenge.
- **Output Artifacts**: `raw/nse-quote.json`, `raw/nse-shareholding.json`, `raw/annual-reports/*.pdf`, `screenshots/nse-overview.png`.

### 2. `src/adapters/screener.ts` (Screener.in Adapter)
- **Functions**: `runScreener(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Navigates Playwright session to `https://www.screener.in/company/<SYMBOL>/consolidated/`.
  2. Extracts fundamental ratio table, 10-year P&L, quarterly results, balance sheet, cash flows, and shareholding pattern.
  3. Discovers PDF links for recent earnings concall transcripts and annual reports.
  4. Downloads concall PDFs to `raw/concalls/`.
- **Output Artifacts**: `raw/screener/screener-fundamentals.json`, `raw/concalls/*.pdf`, `screenshots/screener-fundamentals.png`.

### 3. `src/adapters/tijori.ts` (Tijori Finance Adapter)
- **Functions**: `runTijori(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Navigates to `https://www.tijorifinance.com/company/<COMPANY_SLUG>/`.
  2. Triggers public "Show More" UI flow to expand product revenue breakups and location exposure.
  3. Captures sector operational metrics.
- **Output Artifacts**: `raw/tijori/tijori-data.json`, `screenshots/tijori-overview.png`.

### 4. `src/adapters/tradingview.ts` (TradingView Adapter)
- **Functions**: `runTradingView(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Navigates to `https://in.tradingview.com/chart/?symbol=NSE%3A<SYMBOL>`.
  2. Waits for chart canvas elements and technical indicators to stabilize (up to 45s).
  3. Captures full 1D technical chart screenshot.
  4. Extracts public page header technical summaries.
- **Output Artifacts**: `raw/tradingview/tradingview-snapshot.json`, `screenshots/tradingview-1d-chart.png`.

### 5. `src/adapters/chartink.ts` (Chartink Adapter)
- **Functions**: `runChartink(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Opt-in adapter controlled via `RESEARCH_INCLUDE_CHARTINK=true`.
  2. Uses public UI Copy -> Table -> OK workflow to capture screening tables into CSV / JSON.
- **Output Artifacts**: `raw/chartink/chartink-results.json`.

### 6. `src/adapters/news-sentiment.ts` (News & Sentiment Adapter)
- **Functions**: `runNewsSentiment(ctx: AdapterContext): Promise<AdapterResult>`
- **Workflow**:
  1. Fetches recent news articles from Google News / financial media for `<COMPANY_NAME>` and `<SYMBOL>`.
  2. Calculates headline sentiment scores (positive, neutral, negative).
- **Output Artifacts**: `raw/news-sentiment.json`.

---

## 🏛️ Adapter Design Standards

Every adapter in `src/adapters/` must adhere to these four implementation rules:

1. **Self-Contained Browser Code**: Playwright `runCode` scripts must be isolated string functions executing entirely in the browser context.
2. **Defensive DOM Extraction**: Use safe innerText extractions (`page.locator('body').innerText().catch(() => '')`) so a missing UI element never throws an unhandled exception.
3. **Structured Status Emission**: Emit `SourceArtifact` items with explicit status values (`ok`, `partial`, `not_found`, `blocked`, `error`).
4. **Never Crash the Pipeline**: Wrap top-level execution in `try/catch`. Catch errors, push them to `ctx.warnings` and `ctx.gaps`, and return a valid `AdapterResult`.
