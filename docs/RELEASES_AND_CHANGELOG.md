# Stock Research Pipeline Release History & Changelog

This document consolidates the complete release history and major feature milestones of the **Stock Research Pipeline** from **v1.0** up to **v1.50.0**.

---

## 🚀 Recent Releases (v1.40 – v1.50.0)

### v1.50.0 (Current Release)
- **TradingView direct-only surface capture**: Forecast, News, Documents, Seasonals, and Community are captured through canonical public symbol-page URLs with Playwright; the legacy Metrics/More launcher path was removed from the production adapter.
- **Canonical TradingView URL builder**: Chart, technical, and public surface URL construction is centralized in `src/lib/tradingview-url.ts`.
- **Route/content verification hardened**: A surface is marked `ok` only after exact host/path and surface-specific visible-content confirmation plus a valid screenshot.
- **Evidence contract preserved**: Existing `tradingViewUiSurfaces` and downstream analysis-evidence-pack fields remain unchanged.

### v1.49.5
- **Direct TradingView Public Symbol-Page Surfaces**: Restructured TradingView capture to navigate directly to public symbol pages (`https://in.tradingview.com/chart/?symbol=NSE%3A<SYMBOL>`), extracting technical summaries and full 1D chart screenshots without authentication requirements.
- **Ajv Schema Alignment**: Fixed strict validation rules for 22 required top-level financial analysis fields.

### v1.49.1 – v1.49.4
- **TradingView Metrics & Confirmation**: Added automated chart readiness confirmation checks and direct surface routing for 1D chart views.
- **Debug Trace Logging**: Introduced per-source acquisition debug logs under `research/<SYMBOL>/debug/sources/`.

### v1.48
- **News Sentiment Research Module**: Integrated `research-news` adapter aggregating Google News and financial media headlines, scoring sentiment polarity and impact.

### v1.47
- **Investment Reasoning Protocol**: Implemented explicit reasoning contract rules (`test-investment-reasoning-contract.ts`) ensuring evidence-backed thesis statements.

### v1.46
- **Symbol-Agnostic Resolution**: Introduced official NSE `EQUITY_L` security master lookup, resolving symbols, tickers, exchange prefixes, and URLs to normalized `EQ` series equities.

### v1.45
- **Datewise Historical Research**: Enabled historical point-in-time financial state reconstruction.

### v1.43 – v1.44
- **NSE NextAPI Transition**: Replaced legacy web scraping with direct NSE NextAPI JSON endpoints (`/api/quote-equity`, `/api/historical/cm/equity`, `/api/shareholding-pattern`), including automatic session cookie acquisition and historical 365-day date chunking.

---

## 📜 Historical Milestones (v1.0 – v1.39)

### v1.38
- **Reconciliation Engine**: Added `individual-stock-evidence.ts` and source precedence rules (NSE > Screener > Tijori > TradingView).

### v1.35 – v1.37
- **Market Scans & Quality Gate**: Added long-lived Chartink market scan registry (`scans/`) and quality scoring (`market-scan-quality.ts`).

### v1.22
- **Public UI Extraction Reliability**: Standardized Playwright table extraction using Copy -> Table -> OK workflow for Chartink and public "Show More" expansion for Tijori.

### v1.10 – v1.16
- **Evidence Contract Specification**: Defined raw artifact file structures, `manifest.json`, and MarkItDown ingestion pipeline.

### v1.0
- **Initial Pipeline Release**: Initial architecture separating deterministic data acquisition from LLM financial analysis.
