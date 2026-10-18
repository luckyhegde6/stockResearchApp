# TODO

Prioritized backlog. Items are not claims of existing functionality.

## P0 — correctness

- [x] Add CI for version:check and test:all.
- [ ] Keep CLI/operating docs synchronized with package.json; the new local health-check command is documented in `docs/CLI_REFERENCE.md`.
- [x] Expand regression coverage for readiness edge cases: complete evidence, missing core files, advisory vs blocking gaps, optional-source warnings, actionable warnings, and empty-contract guard.
- [ ] Keep TradingView route tests synchronized with configured surfaces.

## P1 — data export / reporting

- [x] Add per-dataset tab schemas and classified transformers for research and investment analysis.
- [x] Add a clickable `StockResearch` index tab and export audit log.
- [x] Add best-effort automatic publishing after successful research/analysis stages when the webhook is configured.
- [x] Embed captured chart screenshots into a visual-evidence tab within configurable size limits.
- [x] Add a visible Google Sheets Sync tab, live status strip and sixth pipeline step to the local dashboard.
- [x] Track the publishing step and recent attempts for dashboard-triggered research, batch, analysis, Laya and supported market scans.
- [x] Add a universal CLI/npm command lifecycle and append command completion rows to `command-runs-YYYY-MM-DD`.
- [ ] Deploy the latest Apps Script version and verify actual tab rows and screenshot insertion in the target workbook.
- [ ] Compare the AI Studio UI reference against the actual workbook/UI and implement confirmed visual requirements.
- [ ] Add mock-receiver end-to-end tests, idempotent retries and payload preflight.

Task breakdown and acceptance criteria: [docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md](docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md).

Target workbook: [StockResearch](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0). UI reference: [Google AI Studio app preview](https://aistudio.google.com/apps/bf7ddb4a-486d-46db-9e2a-4cc6cfcfee5c?showPreview=true&showAssistant=true). The preview did not load through connected web access, so visual matching remains unverified.

## P1 — developer experience

- [x] Add a machine-readable repository manifest for agents.
- [x] Add `npm run health:check` for Node.js, Playwright Chromium, MarkItDown, repository config, test-suite readiness, and optional integration configuration. It is local-only and does not acquire data or publish.
- [ ] Move superseded historical root docs into docs/archive/ where safe.
- [ ] Add dashboard API contract tests.

## P1 — agentic layer

- [x] Add read-only evidence inspection commands.
- [x] Add a deterministic evidence auditor for manifest/pack provenance and readiness parity.
- [x] Add a machine-readable readiness/source-health summary for agents.
- [x] Add an explicit model-provider boundary (typed interface, OpenAI-compatible adapter, injectable transport, fixture tests).
- [x] Add an opt-in bounded reasoning runner with a fixed plan, safe repository-relative evidence loading/input budget, hard step cap, timeout/output budgets, per-step validation/audit, and fail-closed stop conditions. The CLI flag is `LLM_BOUNDED_REASONING=1`; deterministic readiness is checked first and final analysis is skipped unless both bounded steps validate (ADR-009).

## P2 — research depth

- [ ] Add source registry with terms, free/paid tier, auth/quota, freshness and allowed-use policy (PRD-005).
- [ ] Evaluate opt-in secondary EOD/corporate-action adapter; preserve primary-source precedence and require parity tests (PRD-005).
- [ ] Add reproducible point-in-time research snapshots and deterministic “What Changed?” diffs (PRD-005).
- [ ] Add source-linked corporate event timeline with announcement/effective timestamps and confirmation status (PRD-005).
- [ ] Expand point-in-time/datewise research coverage.
- [ ] Improve market-scan quality/history tests.
- [ ] Add more fixture-backed adapter tests for provider outages.
- [ ] Add configurable evidence freshness policies.

## P2 — chart intelligence, forecasting & backtesting

- [ ] **Kronos forecasting track:** evaluate and integrate ideas from [Kronos](https://github.com/shiyu-coder/Kronos) for OHLCV/K-line forecasting and symbol-level chart analysis. Start with research-only experiments using existing NSE historical data; compare forecast outputs against deterministic technical signals before exposing them to the final analysis layer.
- [ ] **Kronos data/experiment adapter:** define a vendor-isolated interface that can transform each researched symbol's historical OHLCV into a Kronos-compatible time-series dataset, run forecasts, persist model metadata/results, and support reproducible experiments/backtests.
- [ ] **Backtesting framework:** build a deterministic, leakage-aware backtesting layer around generated signals and technical strategies. Include train/validation/test separation where applicable, transaction costs, slippage, position sizing, risk controls, benchmark comparison, and performance metrics.
- [ ] **Pine Script strategy research:** use [awesome-pinescript](https://github.com/pAulseperformance/awesome-pinescript) as a curated reference for Pine syntax, indicators, libraries, strategy patterns, debugging, and TradingView scripting conventions.
- [ ] **Pine strategy corpus:** use the [pinescript-strategies](https://github.com/topics/pinescript-strategies) topic as a discovery source for strategy ideas. Any imported strategy must be normalized, reviewed for lookahead/repainting risk, and converted into a local strategy specification before backtesting.
- [ ] **Chart UI:** evaluate [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) for a lightweight local charting layer that can render the project's deterministic OHLCV/indicator/backtest results without requiring TradingView page capture.
- [ ] **Local Algo integration:** evaluate [OpenAlgo](https://github.com/marketcalls/openalgo) as a future local algorithmic-trading/execution integration boundary. Keep this strictly downstream of research/backtesting first; no live-order capability should be introduced until paper-trading, risk controls, credential isolation, and explicit execution gates are defined.
- [ ] **Research → strategy → backtest contract:** define a stable artifact contract connecting `research/<SYMBOL>` → historical/technical features → strategy definitions → backtest runs → charts → performance reports, without coupling the core evidence pipeline to one model, charting library, or execution platform.

### Reference roles

| Reference | Intended use | Current status |
|---|---|---|
| Kronos | Financial K-line forecasting experiments and chart-analysis research | Research only |
| awesome-pinescript | Pine Script knowledge/reference | Research/reference |
| pinescript-strategies | Strategy discovery corpus | Research/reference |
| Lightweight Charts | Local chart visualization | Evaluate |
| OpenAlgo | Future local algo/execution boundary | Evaluate |

### Guardrails for this roadmap

- Forecasts are experimental signals, not facts.
- Backtests must avoid lookahead bias and should model costs/slippage.
- Pine strategies must be checked for repainting and future-data leakage.
- New forecasting/strategy outputs must remain separate from canonical source facts.
- OpenAlgo/live execution must remain disabled until an explicit execution PRD and safety gate exist.

## P2 — dashboard

- [ ] Add a compact "why not ready?" view.
- [ ] Add provenance drill-down from results to source paths.
- [ ] Add a read-only symbol comparison view.


## P0 — agent foundation and evidence trust

- [x] Add the first read-only agent harness slice: schema/policy validation, bounded result size, audit JSONL, and research evidence inspection CLI.
- [ ] Add schema-validation and policy-check tests for `.agents/harness/agent-result.schema.json`.
- [ ] Add a deterministic agent audit record with redacted tool metadata and run/artifact IDs.
- [ ] Add read-only evidence inspection commands and machine-readable readiness/source-health summary.
- [ ] Add a dashboard "Why is this report not ready?" view with provenance drill-down.
- [ ] Add regression tests proving agents cannot bypass readiness or promote unsupported facts.

## P1 — decision intelligence and research history

- [ ] Add an Evidence Trust Center separating data confidence from investment conviction.
- [ ] Add a one-page decision brief with counter-thesis, catalysts, risks, and "What would change my mind?"
- [ ] Add explicit bull/base/bear valuation scenarios with sourced inputs, labeled assumptions, and sensitivity analysis.
- [ ] Add "What Changed?" comparison across completed runs with period comparability checks and evidence-linked deltas.
- [ ] Add a research timeline for earnings, filings, corporate events, material news, and thesis changes.
- [ ] Add peer comparison and explainable quality/growth/valuation/momentum/risk scorecard.

## P1 — monitoring and distribution

- [ ] Add persistent watchlists and a thesis monitor with source-linked, deduplicated alerts.
- [ ] Add event intelligence for results, board meetings, dividends, bonus/split, buybacks, orders, acquisitions, management, regulatory, litigation, credit/rating, and sector catalysts.
- [ ] Deploy the latest Apps Script version and verify actual target workbook rows and screenshot insertion.
- [ ] Add publishing payload preflight, idempotency keys, bounded retries, and mock-receiver E2E tests.
- [ ] Generate a polished, versioned PDF equity research note.
- [ ] Define a versioned, read-only Research API over validated research artifacts.

## P2 — strategy lab

- [ ] Define versioned strategy specifications and research/backtest artifact contracts.
- [ ] Add leakage-aware deterministic backtesting with point-in-time inputs, out-of-sample evaluation, costs/slippage, benchmark, position sizing, and risk controls.
- [ ] Evaluate Kronos forecasting only as a research experiment against deterministic baselines.
- [ ] Review imported Pine Script for repainting/lookahead before backtesting.
- [ ] Evaluate Lightweight Charts for local deterministic chart rendering.

## P3 — gated execution boundary

- [ ] Write a separate execution/paper-trading PRD covering kill switch, risk limits, credentials, auditability, and explicit human authorization.
- [ ] Keep live order placement disabled until the separate PRD and safety review are approved.

Roadmap details and exit criteria: [docs/wiki/Product-Roadmap.md](docs/wiki/Product-Roadmap.md). Product requirements: [PRD-004](docs/prd/004-evidence-first-research-platform.md) and [PRD-005](docs/prd/005-free-data-and-research-history.md). Source evaluation: [Free Research Data Sources](docs/wiki/Free-Research-Data-Sources.md). GitHub Wiki initialization: [publishing guide](docs/wiki/GitHub-Wiki-Publishing.md). Agent contract: [.agents/README.md](.agents/README.md).
