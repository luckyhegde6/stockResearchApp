# Product Roadmap

## Product promise
**Research every stock. Understand every change. Defend every decision.**

StockResearchApp is an evidence-first research platform for Indian equities. Local artifacts are canonical; the dashboard, Google Sheets, PDF, and future API are consumption surfaces.

## Release 1 — Trust Layer (P0)
Agent contracts, guardrails, bounded harness, Evidence Trust Center, readiness reasons, source health/freshness, conflicts, provenance drill-down, and claim-type separation.
**Exit gate:** readiness cannot be bypassed; material claims are traceable; missing/stale/conflicting evidence is visible.

## Release 2 — Decision Layer (P1)
Decision brief, explicit bull/base/bear scenarios and sensitivity, counter-thesis, risks/catalysts, “What would change my mind?”, peer comparison, explainable scorecard.
**Exit gate:** assumptions are visible; scores are explainable; limitations and counter-evidence are included.

## Release 3 — Research History (P1)
Compare current and previous runs; timeline of results, filings, events, news, price and valuation changes; explain changed/unchanged conclusions.
**Exit gate:** period compatibility is checked and material deltas link to evidence.

## Release 4 — Watchlist & Monitoring (P1)
Persistent watchlist/thesis monitor, corporate-event/news alerts, source links, confirmation status, deduplication, severity, freshness, configurable thresholds.
**Exit gate:** no alert without traceable evidence; unconfirmed reports remain labeled.

## Release 5 — Distribution (P1)
Verify Sheets deployment, payload preflight, idempotent retries, mock receiver E2E, PDF equity research note, versioned read-only Research API.
**Exit gate:** remote success is confirmed; local research survives export failure; duplicate writes are prevented where supported.

## Release 6 — Strategy Lab (P2)
Versioned strategies, deterministic backtests, point-in-time data, no lookahead/repainting, costs/slippage, benchmark, out-of-sample evaluation. Evaluate Kronos and Lightweight Charts separately from canonical evidence.
**Exit gate:** reproducible runs, realistic costs, leakage tests, out-of-sample results, clear limitations.

## Release 7 — Execution Boundary (P3 / gated)
Research API consumers and potential paper-trading integration only after explicit design review. Live execution is not approved by this roadmap; it requires a separate PRD, paper trading, kill switch, risk limits, credential isolation, audit logs, and explicit human authorization.

## Product metrics
Evidence coverage; readiness transparency; time to understand a report; research completion/repeat usage; material-change explanation coverage; publishing success and duplicate-write rate; alert usefulness/false-positive rate; out-of-sample strategy quality.

## Deliberately deferred
Autonomous agents before evidence/readiness stability; headline price forecasting without baselines and out-of-sample evaluation; live execution before a separate safety design; provider expansion without a justified evidence gap.
