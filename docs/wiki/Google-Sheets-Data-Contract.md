# Google Sheets Data Contract

## Purpose

A run tab is a decision-ready, evidence-backed equity research dossier, not a dump of command output. The local research artifacts remain canonical; Google Sheets is the human-review and sharing layer.

**Hard rule:** never invent a value, upcoming-event date, indicator, source, headline, or conclusion to fill a blank. Use explicit `not_available` / `not_confirmed` states and expose freshness, missing evidence and conflicts.

## Recommended reading order

`EXECUTIVE VIEW → MARKET & PRICE ACTION → EARNINGS & FINANCIALS → FUNDAMENTALS & VALUATION → TECHNICALS → NEWS & CATALYSTS → FINDINGS & RISKS → SOURCES & QUALITY → SCREENSHOTS`

Current implementation labels are preserved where practical: SUMMARY, EVIDENCE, SOURCES, FINDINGS, QUALITY and SCREENSHOTS; analysis exports also publish SCORES, RISKS, CATALYSTS, SCENARIOS and AUDIT sections in their consolidated run tab.

## 1. EXECUTIVE VIEW / SUMMARY

Should provide:
- ticker, issuer, exchange, sector/industry, analysis timestamp and freshest market-data timestamp
- overall view: BUY / ACCUMULATE / HOLD / REDUCE / SELL / NO CALL, with a plain-language thesis
- separate action guidance for an existing holder and a new investor when available
- time horizon, confidence, data completeness/readiness and recommendation conviction
- current price and currency, market cap and valuation snapshot (with source and timestamp)
- top supporting reasons, key risks, catalysts and thesis-invalidation conditions
- largest data gaps/conflicts and whether the report is ready for a decision

A research-only/acquisition export must not masquerade as an investment recommendation. Until a schema-validated analysis artifact exists, label the overall view as `RESEARCH_ONLY / NO CALL`.

## 2. MARKET & PRICE ACTION

Publish sourced or deterministically calculated:
- latest price / previous close / timestamp / session state
- daily, weekly, monthly, 3-month, 6-month and 1-year changes when required price history exists
- 52-week high/low and distance from those levels
- volume, average volume and relative volume (state lookback window)
- trend, gap, breakout/breakdown, range expansion and support/resistance only where methodology and evidence are traceable
- market/index/sector-relative performance only when comparison series and matching windows exist

Each record should state metric, value, unit, period/window, source/source URL, as-of time, method if calculated, and confidence/freshness where available.

## 3. EARNINGS & FINANCIAL STATEMENTS

Cover latest reported quarter and FY / trailing-twelve-month values where present:
- revenue, EBITDA/operating profit, EBIT, PAT/net income and basic/diluted EPS
- YoY and QoQ growth, gross/operating/net margins and margin change
- balance sheet: cash, debt, net debt, equity, leverage and liquidity
- cash flow: operating cash flow, capex, free cash flow and cash conversion
- ROE/ROCE and other reported or reproducibly calculated return metrics
- earnings quality: one-off items, accrual/cash mismatch, dilution and consistency of guidance where source evidence exists
- reporting period, consolidated/standalone basis, units/currency and provenance

Never compare mismatched periods, units or consolidation basis without explicitly flagging the mismatch.

## 4. FUNDAMENTALS & VALUATION

Explain business model and sector context; revenue/profit growth quality; margin, return and balance-sheet trajectory; capital allocation; promoter/institutional ownership and governance signals where sourced; valuation metrics (P/E, P/B, EV/EBITDA, yield measures) and comparative context only when data is comparable. Distinguish business quality from whether the current price offers attractive expected return.

## 5. TECHNICALS

Expose values and timeframe for RSI, MACD, relevant moving averages (e.g., 20/50/200 session), ATR/volatility, trend/market phase and support/resistance when deterministically calculated from adequate history or sourced. Record inputs/window, as-of time and source. Do not imply an indicator is available merely because a chart screenshot exists.

## 6. NEWS, EARNINGS DATES & CORPORATE ACTIONS

For each item include event/headline, category, scheduled/published date and timezone where known, publisher/source, clickable URL, retrieved-at timestamp, relevance and directional interpretation.
- next earnings/result date and board-meeting date
- dividend/record date/ex-date, split/bonus, buyback, rights issue and other material corporate actions
- regulatory filings, material orders, management changes, litigation and sector developments
- recent news with publication date and direct source link

Upcoming dates must be backed by current source material. If a date is not confirmed by a reliable source, use `not_confirmed`; do not infer a date from a previous quarter's pattern.

## 7. FINDINGS, RISKS & SCENARIOS

A finding is an interpretation, not a raw fact. Keep source facts and deterministic calculations distinguishable from analyst reasoning. Include:
- finding / domain / supporting evidence IDs / source links / confidence
- bull/base/bear case and assumptions
- ranked risks with probability, impact, warning signals and priced-in assessment when supported
- catalysts, expected timeframe, confirmation condition and potential impact
- thesis-invalidation conditions and watchlist metrics/levels
- counter-thesis / disconfirming evidence

A recommendation must not be more confident than the evidence. If high-impact information is missing, downgrade the conclusion to conditional or `NO CALL`.

## 8. SOURCES & QUALITY

Sources should include publisher/provider, source title/type, URL, source publication/retrieval timestamps, reporting period, acquisition status and artifact/evidence IDs. Keep local filesystem paths out of published rows.

Quality should show readiness, missing required artifacts, stale data, source health, conflicts, coverage and warnings. Blank is not zero; missing must not look like a negative finding.

## 9. SCREENSHOTS

Each image row includes original filename/size/dimensions, optimized size/dimensions, optimization flag, JPEG quality, final status, embedding status and notes. The image should be attached in the preview column in the same run tab, preserving aspect ratio.

Current implementation limits:
- client re-encodes as JPEG through Playwright Chromium
- target <=900,000 pixels
- default max image size 1.4 MB (user-configurable but capped at 1.8 MB)
- total screenshot payload default 5 MB and screenshot count default 8
- Apps Script independently validates <=1.8 MB and <=1,000,000 pixels

Only `embedded_in_sheet` after receiver insertion indicates success. Verify actual visibility in the workbook; successful upload alone is not acceptance.

## 10. Index and operational separation

`StockResearch` is the clickable run index. Each research or analysis export has one consolidated data tab. Do not publish `_EXPORT_LOG` or `command-runs-*` tabs. Publication failures must not delete or invalidate local research artifacts.

## Implementation status distinction

This file defines the analyst-facing target contract. Actual published fields still depend on the local artifact package. Do not claim a category is populated unless the exporter produced the records and the live workbook was inspected.
