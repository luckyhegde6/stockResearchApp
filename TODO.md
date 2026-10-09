# TODO

Prioritized backlog. Items are not claims of existing functionality.

## P0 — correctness

- [x] Add CI for version:check and test:all.
- [ ] Keep CLI/operating docs synchronized with package.json.
- [ ] Expand regression coverage for readiness edge cases.
- [ ] Keep TradingView route tests synchronized with configured surfaces.

## P1 — data export / reporting

- [x] Add per-dataset tab schemas and classified transformers for research and investment analysis.
- [x] Add a clickable `StockResearch` index tab and export audit log.
- [x] Add best-effort automatic publishing after successful research/analysis stages when the webhook is configured.
- [x] Embed captured chart screenshots into a visual-evidence tab within configurable size limits.
- [x] Add a visible Google Sheets Sync tab and live status strip to the local dashboard.
- [x] Track the publishing step and recent attempts for dashboard-triggered research, batch, analysis, Laya and supported market scans.
- [ ] Deploy the latest Apps Script version and verify actual tab rows and screenshot insertion in the target workbook.
- [ ] Compare the AI Studio UI reference against the actual workbook/UI and implement confirmed visual requirements.
- [ ] Add mock-receiver end-to-end tests, idempotent retries and payload preflight.

Task breakdown and acceptance criteria: [docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md](docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md).

Target workbook: [StockResearch](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0). UI reference: [Google AI Studio app preview](https://aistudio.google.com/apps/bf7ddb4a-486d-46db-9e2a-4cc6cfcfee5c?showPreview=true&showAssistant=true). The preview did not load through connected web access, so visual matching remains unverified.

## P1 — developer experience

- [x] Add a machine-readable repository manifest for agents.
- [ ] Add a lightweight local health command for runtime, Playwright, MarkItDown, config, and test readiness.
- [ ] Move superseded historical root docs into docs/archive/ where safe.
- [ ] Add dashboard API contract tests.

## P1 — agentic layer

- [ ] Add read-only evidence inspection commands.
- [ ] Add a machine-readable readiness/source-health summary for agents.
- [ ] Add an explicit model-provider boundary.
- [ ] Add bounded multi-step reasoning only after the deterministic handoff contract is stable.

## P2 — research depth

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
