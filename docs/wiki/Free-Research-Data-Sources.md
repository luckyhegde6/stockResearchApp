
# Free Research Data Sources & Feature Expansion

**Research date:** 2026-10-15  
**Scope:** Indian equities, evidence-first research, no paid dependency required for the first useful increment.

This is a source evaluation and proposal, not a claim that these providers are already integrated. “Free to access” is not identical to “free to redistribute” or “permitted for commercial display”; verify current terms before production use.

## Executive recommendation

Prioritize a **corporate-action-aware end-of-day history adapter and point-in-time history store** ahead of prediction models or more LLM agents. It would strengthen deterministic technical analysis, total-return interpretation, historical comparisons and future leakage-aware backtests.

The first source to evaluate is [TejHQ tej-bazaar](https://github.com/tejhq/tej-bazaar) / [tej-api docs](https://tejhq.dev/docs). Its current documentation describes an open pipeline based on NSE/BSE bhavcopy and a hosted tier with keyless EOD OHLCV, exchange snapshots and corporate actions. A free-key tier is documented for adjusted prices and symbol history with a 1,000-calls/day quota. Quotas and terms can change; verify at implementation time. The source-code license does not automatically license every use of upstream exchange data.

## Candidate sources

### 1. TejHQ / tej-bazaar / tej-api — recommended evaluation

- References: [open-source pipeline](https://github.com/tejhq/tej-bazaar), [API docs](https://tejhq.dev/docs), [project overview](https://tejhq.dev/).
- Documented no-key routes: historical EOD OHLCV, exchange/date snapshots, and corporate actions.
- Documented free-key routes: adjusted prices and symbol history; current docs state 1,000 calls/day and 300/min for this tier.
- Research opportunities:
  - Long daily-bar history for trend, volatility and relative-strength features.
  - Split/bonus/dividend-aware adjusted-price validation.
  - Corporate-action calendar and adjustment-aware return calculations.
  - ISIN/symbol history for mergers, ticker changes and instrument continuity.
  - Point-in-time liquidity universe to reduce survivorship bias.
- Risks and gates: validate sample bars against an existing source; track stale/missing sessions; review terms; preserve it as secondary evidence until parity tests pass.

### 2. NSE public filings and announcements — authoritative event evidence

- Reference: [NSE corporate filings/announcements](https://www.nseindia.com/companies-listing/corporate-filings-announcements).
- Public listing page supports searching/filtering announcements and exposes subject, details, attachment/XBRL links and broadcast timestamps.
- Feature potential: evidence-linked timeline for results, board meetings, dividends, splits/bonus, buybacks, investor calls, orders, acquisitions, management and regulatory disclosures.
- Constraints: comply with current access and redistribution rules; handle 403/rate limits respectfully; do not bypass controls. NSE's [data usage policy](https://www.nseindia.com/static/market-data/nse-data-policy) includes usage and redistribution restrictions, and some corporate-data products are paid. Verify terms for automated reuse.

### 3. Issuer investor-relations pages and annual reports — primary company evidence

- Discover the official investor-relations/financial-results page and preserve exact issuer-hosted URLs.
- Features: parse annual reports, results, investor presentations and earnings-call transcripts; compare management guidance with later reported outcomes; derive segment growth, margins, cash conversion, leverage and capital allocation.
- Constraints: issuer sites differ. Preserve original bytes/hash, retrieval time, and parser status. Prefer issuer-hosted originals over third-party copies.

### 4. Yahoo Finance via yfinance — optional cross-check only

- Reference: [yfinance source and documentation](https://github.com/ranaroussi/yfinance).
- Useful for diagnostic historical-price comparison, and some symbol/industry/financial fields depending on coverage.
- Constraint: unofficial, not endorsed by Yahoo, and yfinance's own README says Yahoo's API is intended for personal use. Review Yahoo terms; don't rely on this as commercial data entitlement or silently replace missing NSE data.

### 5. Google News RSS and public article pages — supplementary discovery

- Store publisher, article URL, published time, fetch time, headline and extraction status; deduplicate syndicated copies.
- Headline sentiment is not confirmed material impact. Link interpretations to the article and, where possible, issuer/exchange filings.
- Existing news acquisition already covers some of this. Improve source quality, dedupe and provenance before adding another generic vendor.

### 6. Bulk research datasets / open research infrastructure

- TejHQ documents public Parquet data on [Hugging Face](https://huggingface.co/tejhq/indian-markets) and an MIT-licensed pipeline; helpful for local tests if dataset lineage and license are verified.
- GitHub/Pine Script repositories provide ideas/code, not authoritative performance. Review each license, lookahead and repainting before importing into a versioned internal strategy format.

## Features ranked by research value

### P0 — Source availability and terms registry

Create `config/data-sources.json` with source role, free/paid tier, authentication, allowed purpose, terms/license URL, freshness expectation, quota and last review date. Distinguish `free_to_access`, `free_to_use` and `redistributable`. CI should reject an adapter lacking an explicit policy.

### P1 — Corporate-action-aware OHLCV and provenance

Add a secondary EOD adapter behind a feature flag, keeping raw responses unchanged and normalized daily bars separate. Validate trading sessions, duplicate rows, OHLC invariants, invalid prices, symbol/ISIN continuity and adjustment factors. Compare sample bars to existing NSE history and preserve discrepancies.

**Acceptance:** fixture tests for success, malformed/missing/stale/duplicate data and outages; no overwrite of primary data; source-precedence decision recorded.

### P1 — Point-in-time snapshots and “What Changed?”

Persist stable run identity, as-of date, source versions/checksums and schema versions. Compare added/removed/changed facts and source/readiness quality only for compatible units, periods, consolidation scopes and price-adjustment bases.

**Acceptance:** deterministic delta report links to old/new source artifacts and refuses incompatible comparisons.

### P1 — Source-linked event intelligence timeline

Normalize announcements/documents to `event_type`, `announced_at`, `effective_date` only when explicitly sourced, `source_url`, `artifact_id`, and confirmation status. Keep source facts separate from interpreted materiality.

**Acceptance:** source-linked deduplication and exact date precision; unconfirmed items never become confirmed.

### P1 — Peer and sector scorecard

Compare comparable financial periods and explicit peer groups. Show growth, profitability/cash conversion, leverage, valuation, momentum/liquidity and data quality as separate components with formulas and evidence.

**Acceptance:** explainable metrics; warnings for incomparable data or small peer groups; no probability language.

### P1 — Deterministic valuation sensitivity

Build assumption-driven P/E, EV/EBITDA or price/sales sensitivity tables where data supports them, plus reverse valuation (assumptions implied by the current price). Keep observed facts separate from editable assumptions.

### P2 — Leakage-aware backtesting

Before model forecasting, build deterministic strategies over point-in-time daily bars. Include costs, slippage, corporate actions, position sizing, drawdown, benchmark and out-of-sample splits. Persist dataset hashes and strategy parameters; test lookahead and survivorship bias.

### P2 — Forecast experiment harness

Only after backtesting is reliable, compare experimental forecasts (e.g. Kronos) with simple baselines such as last close, moving average and momentum/mean reversion. Record cut-off, horizon, training window and error by symbol/regime. Forecasts are model outputs, not evidence facts.

### P2 — Local charts and explainability

Evaluate TradingView Lightweight Charts to render stored OHLCV, deterministic indicators, events and backtest trades. Tooltips should show as-of/source metadata and adjusted/unadjusted basis.

### P2 — Thesis monitoring

Add a persisted watchlist, thesis/invalidation conditions and source-linked material-change alerts. Deduplicate alerts and expose freshness, severity and confirmation. Start with daily digests, not live-feed dependence.

## Recommended sequence

1. Resolve docs navigation and clarify status.
2. Merge/review provider-boundary PR #8 only after CI passes.
3. Build source registry and data-quality contracts.
4. Add the opt-in secondary EOD/corporate-actions adapter.
5. Add versioned research snapshots and deterministic “What Changed?”.
6. Add source-linked event timeline.
7. Add peer scorecard and valuation sensitivities.
8. Add leakage-aware backtesting.
9. Only then add forecasting and bounded multi-step reasoning.

## Policy caution

NSE's data policy specifies limits on market-data usage and redistribution. Free public access is not permission for arbitrary redistribution/commercial use. The fetcher code license is not the upstream data license. Preserve provenance and verify exact terms before using a source in any public or paid product.
