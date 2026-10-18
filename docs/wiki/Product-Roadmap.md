
# Product Roadmap

**Status legend:** Implemented = code/tests exist; In progress = active PR or partial implementation; Planned = backlog only; Operational verification = requires external deployment/data run.

## Product promise

**Research every stock. Understand every change. Defend every decision.**

StockResearchApp is an evidence-first research platform for Indian equities. Local artifacts are canonical; the dashboard, Google Sheets, PDF, and future API are consumption surfaces.

## Current baseline (2026-10-19)

- **Implemented:** deterministic acquisition/preparation, canonical artifacts, reconciliation, quality/readiness gates, optional schema-validated analysis, local dashboard, market scans, Google Sheets export code.
- **Implemented and merged:** read-only agent result validation, evidence inspection, and deterministic evidence audit from PR #7.
- **Merged:** vendor-neutral model provider adapter (PR #8), bounded reasoning (PR #9), guardrail hardening (PR #10), event-date regression coverage (PR #12), and MarkItDown/document-ingestion plus period-aware reconciliation (PR #13).
- **Operational verification pending:** live Apps Script deployment and actual workbook screenshot insertion.
- **Implemented on the current follow-up branch:** local-only `health:check` command; branch CI validation is pending.\n- **Planned:** Evidence Trust Center, What Changed, source-linked event timeline, monitoring, peer scorecard, robust backtesting and read-only API.

## Release 1 — Trust Layer (P0; partially implemented)

Agent contracts, guardrails, bounded harness, Evidence Trust Center, readiness reasons, source health/freshness, conflicts, provenance drill-down, and claim-type separation.

Current: deterministic readiness and an initial read-only harness/auditor exist. Dashboard trust/provenance surfaces and complete agent policy regression remain open.

**Exit gate:** readiness cannot be bypassed; material claims are traceable; missing/stale/conflicting evidence is visible; agent policy tests demonstrate fail-closed behavior.

## Release 2 — Decision Layer (P1; planned)

Decision brief, explicit bull/base/bear scenarios and sensitivity, counter-thesis, risks/catalysts, “What would change my mind?”, peer comparison, explainable scorecard.

**Exit gate:** assumptions visible; scores explainable; limitations and counter-evidence included.

## Release 3 — Research History (P1; planned)

Compare current and previous runs; timeline of results, filings, events, news, price and valuation changes; explain changed/unchanged conclusions.

**Exit gate:** period compatibility is checked and material deltas link to evidence.

## Release 4 — Watchlist & Monitoring (P1; planned)

Persistent watchlist/thesis monitor, corporate-event/news alerts, source links, confirmation status, deduplication, severity, freshness and configurable thresholds.

**Exit gate:** no alert without traceable evidence; unconfirmed reports remain labeled.

## Release 5 — Distribution (P1; partly implemented)

Verify Sheets deployment, payload preflight, idempotent retries, mock receiver E2E, PDF equity research note, versioned read-only Research API.

Current: exporter/code/dashboard hooks exist. Apps Script live verification, robust retries/mock E2E, PDF and read-only API remain open.

**Exit gate:** remote success confirmed; local research survives export failure; duplicate writes prevented where supported.

## Release 6 — Strategy Lab (P2; planned)

Versioned strategies, deterministic backtests, point-in-time data, no lookahead/repainting, costs/slippage, benchmark, out-of-sample evaluation. Evaluate Kronos and Lightweight Charts separately from canonical evidence.

**Exit gate:** reproducible runs, realistic costs, leakage tests, out-of-sample results and documented limitations.

## Release 7 — Execution Boundary (P3; blocked/gated)

Research API consumers and potential paper trading only after explicit design review. Live execution is not approved by this roadmap; it requires a separate PRD, paper trading, kill switch, risk limits, credential isolation, audit logs and explicit human authorization.

## Immediate next tasks

1. Complete readiness edge-case regression coverage and keep CLI/operating docs synchronized with `package.json`.
2. Add remaining harness schema/policy tests and a redacted deterministic agent audit record.
3. Add dashboard “why not ready?” and provenance drill-down.
4. Verify Apps Script deployment and live export behavior; add payload preflight, idempotent retries and mock-receiver end-to-end tests.
5. Add source terms registry, then evaluate a secondary EOD/corporate-actions source.
6. Add point-in-time snapshot comparison, event timeline, peer scorecard, then leakage-aware backtesting.

## Deliberately deferred

Autonomous agents before evidence/readiness stability; headline price forecasting without baselines/out-of-sample evaluation; live execution before a separate safety design; provider expansion without a justified evidence gap.
