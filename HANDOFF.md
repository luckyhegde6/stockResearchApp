# Handoff

Updated: 2026-10-11
Default branch: `main`
Investment-report follow-up branch: `feat/investment-report-sheets`
Previous implementation PR: [#1 — Initialize stock research pipeline](https://github.com/luckyhegde6/stockResearchApp/pull/1) (merged)

## Current state

The Google Sheets publishing implementation is in `main`. The old `fix/sheets-screenshot-evidence` branch points to the same commit as `main`; compare returns `identical` with 0 commits ahead, 0 behind, and no changed files. The comparison page is empty for that reason, not because it has a valid diff that is being hidden.

The follow-up branch `feat/investment-report-sheets` documents the intended decision-ready reporting contract. Keep raw findings/evidence distinct from a validated investment view.

## Current Sheets implementation

- One consolidated data tab per research/analysis run, plus the `StockResearch` index tab.
- Research tabs currently contain SUMMARY, EVIDENCE, SOURCES, FINDINGS, QUALITY, and SCREENSHOTS. Analysis tabs additionally contain SCORES, RISKS, CATALYSTS, SCENARIOS, and AUDIT.
- Screenshot exporter code re-encodes image files as JPEG in Playwright Chromium, targets <=900,000 pixels, applies a configurable per-image byte cap (default 1.4 MB, hard capped at 1.8 MB), total payload cap (default 5 MB), and max screenshot count (default 8). Apps Script checks <=1,800,000 bytes and <=1,000,000 pixels again before inserting.
- Screenshot rows retain original/optimized byte sizes and dimensions, JPEG quality, and an optimization flag. On insertion success/failure, `value`, `status`, and `embedding_status` are set together.
- These source-code constraints prove the optimization/validation code path exists. They do **not** prove that the user's deployed Apps Script embeds images; that requires live verification.

## Desired investment-research deliverable

The workbook should read like an evidence-backed equity research note that an analyst or investment banker can review before deciding. At minimum, the report contract should cover:

1. Executive view: overall stance (BUY/ACCUMULATE/HOLD/REDUCE/SELL/NO CALL), time horizon, confidence, thesis, reasons, valuation context, risk/reward, and what would invalidate the view.
2. Earnings and financials: latest reporting period, revenue/profit/EPS growth, margins, balance-sheet leverage/liquidity, operating cash flow/free cash flow, and earnings quality; each item should include units, period, source, as-of date and confidence where available.
3. Price action and volume: current/previous close, daily and multi-period change, 52-week range, support/resistance where sourced/calculated, volume versus average volume, relative strength, trend and event-day moves.
4. Technicals: RSI, MACD, moving averages, volatility/ATR, volume trend and chart timeframes, explicitly marking unavailable data rather than filling in estimates.
5. Events and catalysts: next earnings date, board/results date, dividends, splits, buybacks, corporate actions and other material event dates, with source links and freshness.
6. News: recent material headlines, published timestamp, publisher, URL, relevance and directional interpretation. Headlines should link to the source.
7. Fundamentals and valuation: business/sector context, valuation multiples, historical/peer context only when comparable data exists, growth durability, profitability, capital allocation, ownership/governance and key risks.
8. Decision summary: bull/base/bear cases, catalysts, downside risks, watch levels/metrics, position-specific action where applicable, and data gaps/conflicts.

Separate sourced facts, deterministic calculations and analyst interpretation. No invented event dates, prices, technical indicator values, financial values or news summaries. Missing data should say `not_available` and lower readiness/confidence. A research-only/acquisition export should say `RESEARCH_ONLY / NO CALL` rather than masquerading as a validated recommendation.

## Verification and blockers

- Previous GitHub Actions run #388 passed `npm run version:check`, `npm run typecheck` and `npm run test:all` on implementation commit `e072f10c269cc457317837617947ca43c1ad9b5a`. This is historical CI, not proof of a fresh run on current main.
- Live workbook contents and actual screenshot visibility are unverified.
- GitHub source changes do not deploy Apps Script automatically.
- The Apps Script health check should report `ok: true`, `service: stock-research-sheet-sink`, `serviceVersion: 2`, and the expected workbook ID.
- Missing `GOOGLE_SHEETS_WEBHOOK_URL` or `GOOGLE_SHEETS_WEBHOOK_TOKEN` means publication is not configured; local research should remain valid.

## Local end-to-end acceptance

1. Pull the target branch and run `npm ci`.
2. Run `npm run version:check`, `npm run typecheck`, and `npm run test:all`.
3. Set local `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_TOKEN`, and `GOOGLE_SHEETS_ID`; never commit secrets.
4. Deploy the current `integrations/google-sheets/Code.gs` into the target workbook's Apps Script Web App and set Script Properties `SHEET_ID` and `API_TOKEN`.
5. Run `npm run sheets:doctor`.
6. Generate fresh research for a known symbol, then run `npm run sheets:export -- research HDFCBANK`.
7. If a schema-valid analysis artifact exists, run `npm run sheets:export -- analysis HDFCBANK`.
8. Check export counts and screenshot metadata. Require each intended image to be embedded or to have an explicit skip/failure reason.
9. Open the Google Sheet itself and verify the image objects are visibly rendered. A successful HTTP response alone is not acceptance.
10. Verify key report fields and source links against local artifacts; missing fields must be explicitly unavailable, not inferred.

## Safety boundary

Keep reporting separate from order execution. The workbook should inform investment decisions, not place trades. Recommendations must include uncertainty, freshness, gaps and risk context and should never be presented as guaranteed outcomes.
