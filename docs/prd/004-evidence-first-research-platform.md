# PRD-004: Evidence-First Research Platform & Agent System

- Status: Active roadmap; partially implemented (requirements remain open)
- Owner: Product / Engineering
- Priority: P0 foundation, then staged P1/P2 delivery
- Last reviewed: 2026-10-15
- Scope: NSE-first Indian-equity research, agent orchestration, evidence trust, product roadmap

## 1. Product thesis

**Research every stock. Understand every change. Defend every decision.**

StockResearchApp is an evidence-first investment research platform for Indian equities. Its differentiator is not the volume of indicators or the fluency of generated prose; it is auditable evidence, explicit uncertainty, reproducible calculations, longitudinal comparison, and thesis tracking.

The system produces research artifacts and decision support. It is not a broker, order-management system, personalized financial adviser, or guarantee of returns.

## 2. Problem

Users need to combine market data, company financials, valuation, technical context, news, corporate events, and risks. Existing AI summaries can hide stale data, source conflicts, unsupported claims, and assumptions. Research is also hard to compare across dates, reproduce, or publish consistently.

## 3. Target users

- Individual investors researching NSE-listed companies.
- Analysts who need traceable evidence and a repeatable research workflow.
- Developers and coding agents extending the research pipeline.
- Future users monitoring watchlists and thesis-changing events.

## 4. Product principles

1. Evidence before interpretation.
2. Deterministic acquisition, normalization, reconciliation, technical calculations, and readiness.
3. Facts, deterministic calculations, and analyst interpretation are distinct types.
4. Every important claim should have provenance, as-of time, freshness, and confidence where available.
5. Missing, stale, disputed, or unconfirmed data is visible; never silently inferred.
6. Data confidence and investment conviction are separate dimensions.
7. Research artifacts are canonical; Google Sheets, dashboard, and future PDF/API are views or distribution channels.
8. LLMs are optional and downstream of deterministic readiness.
9. Explain why a conclusion changed—or why it did not.
10. No live execution without a separate approved execution PRD and explicit risk gates.

## 5. Current baseline and constraints

The repository already contains a deterministic acquisition pipeline, raw evidence preservation, normalization, canonical evidence, reconciliation, source-health/evidence-quality artifacts, readiness gate, optional schema-validated LLM analysis, local dashboard, market scans, and Google Sheets publishing. Do not claim that every future capability in this PRD is implemented.

Core source policy in the current developer guide: NSE, Screener, Tijori, TradingView; supplementary news; optional Chartink; BSE excluded from production individual-stock analysis. Source policy changes require an explicit decision and tests.

The existing readiness gate and JSON schema are authoritative. Agents must wrap existing interfaces rather than invent parallel contracts.

## 6. Primary user journeys

### A. Research a symbol
Resolve the NSE instrument → collect source artifacts → normalize and reconcile → inspect quality/readiness → optionally generate a validated analysis → review evidence and screenshots.

### B. Understand the verdict
Read executive view → market/price action → earnings/financials → fundamentals/valuation → technicals → news/catalysts → findings/risks → sources/quality → screenshots.

### C. Understand what changed
Compare two completed runs with comparable periods and metrics; list additions, removals, changed values, source/freshness changes, materiality, and thesis impact. Do not compare incompatible reporting periods without a visible warning.

### D. Monitor a thesis
Define a thesis, invalidation conditions, evidence to watch, and event types. Alerts must cite the underlying evidence and distinguish confirmed events from unconfirmed reports.

### E. Publish/share research
Publish a stable research snapshot to the dashboard, Sheets, PDF, or API without changing canonical evidence. A publishing failure must not corrupt or invalidate local research.

## 7. Functional requirements

### P0 — Evidence Trust Center
- Display readiness state and deterministic reasons for blocked/limited analysis.
- Display source health, retrieval/as-of timestamps, freshness, missing fields, and conflicts.
- Drill down from material claims to source artifact/URL and calculation method.
- Separate data confidence from investment conviction.
- Show which values are sourced facts versus calculations versus interpretation.
- Never imply freshness when timestamps are absent or invalid.

### P0 — Agent operating system
- Define agent-neutral role contracts, allowed inputs/outputs, tools, limits, and stop conditions.
- Provide reusable research skills, orchestration harness, schemas, policy rules, and test fixtures.
- Make the deterministic pipeline the source of truth; agents cannot bypass readiness.
- Include a validation/audit record for every agent run.
- Default agents to read-only; mutation/publishing requires a specifically authorized workflow.

### P1 — Decision brief and scenarios
- Present thesis, supporting and counter evidence, valuation assumptions, catalysts, risks, bull/base/bear scenarios, and thesis invalidation.
- Clearly label assumptions and calculation methods.
- Distinguish existing-holder portfolio context from prospective-investor analysis; do not give individualized advice without a separately approved scope.

### P1 — What Changed?
- Compare current and previous completed runs.
- Detect changes in price, financials, valuation, technicals, news, events, evidence quality, and source availability.
- Explain materiality and likely thesis impact; retain evidence links.
- State why the recommendation did not change when evidence changed but conclusion stayed stable.

### P1 — Watchlist / Thesis Monitor
- Persist symbols, thesis statements, watch conditions, and last-reviewed run.
- Monitor earnings/results, board meetings, dividends, splits, bonuses, buybacks, orders, acquisitions, management changes, regulation, litigation, credit/rating changes, and sector catalysts where sources support them.
- Alerts must be actionable, explainable, deduplicated, and source-linked.

### P1 — Research publishing
- Verify Apps Script deployment against the target workbook.
- Add payload preflight, idempotency keys, bounded retry/backoff, mock-receiver E2E tests, and auditability.
- Produce a polished PDF research note from a versioned snapshot.
- Publishing is downstream; source artifacts remain canonical.

### P1 — Peer comparison and scorecard
- Compare comparable financial periods and relevant peers.
- Expose component definitions and supporting evidence for quality, growth, valuation, momentum, risk, and management.
- Do not present scores as probabilities or guarantees.

### P2 — Strategy Lab
- Version deterministic strategy specifications.
- Enforce point-in-time inputs, no lookahead, out-of-sample evaluation, transaction costs, slippage, position sizing, benchmark comparison, and risk controls.
- Keep forecasts/strategy outputs separate from canonical facts.
- No live orders in this phase.

### P3 — Research API and execution boundary
- Offer versioned read-only endpoints over validated artifacts.
- Execution is out of scope until paper trading, kill switches, risk limits, credential isolation, audit trail, and explicit human authorization are specified and reviewed.

## 8. Non-functional requirements

- Reproducible runs with schema/version metadata.
- Resilient to individual provider outages; failures must be explicit.
- Secrets and private browser state never enter logs, artifacts, commits, or published data.
- Bounded concurrency, timeouts, retries, token budgets, and file sizes.
- Safe handling of untrusted source HTML, PDFs, news, and tool output.
- Clear CLI diagnostics and machine-readable results.
- Tests cover normal, missing, stale, conflicting, malformed, and provider-outage cases.

## 9. Agent contract

Every agent declares: id, purpose, inputs, outputs, allowed tools, read/write scope, required evidence, validation, timeout/budget, failure behavior, and prohibited actions. Agent output must be structured and schema-validated. No agent may invent source facts, overwrite raw evidence, change the canonical source hierarchy, suppress conflicts, or turn a failed readiness check into a ready state.

## 10. Success metrics

- Evidence coverage: required claims with usable provenance / required claims.
- Readiness transparency: blocked runs with actionable reasons.
- Research completion rate and median time to understand a report.
- Publishing success rate and duplicate-write rate.
- Percentage of material changes linked to evidence.
- Repeat research usage and alert usefulness.
- Regression rate for schema, readiness, and provider outage handling.

Do not optimize for report count alone.

## 11. Release plan

1. Trust foundation: agent contracts, guardrails, harness, readiness explanation, provenance.
2. Decision layer: decision brief, scenarios, thesis invalidation.
3. Research history: run comparison and research timeline.
4. Monitoring: watchlists, event intelligence, explainable alerts.
5. Distribution: Sheets reliability, PDF, read-only Research API.
6. Strategy lab: leakage-aware backtesting and forecast experiments.
7. Execution boundary: separate PRD and safety review; not authorized by this document.

## 12. Acceptance criteria

- Agent definitions and skills are discoverable and versioned.
- All agent outputs declare provenance and uncertainty or explicitly say unavailable.
- Readiness cannot be bypassed by agent prompts or orchestration.
- Test harness can run with deterministic fixtures and mock model/provider responses.
- Documentation identifies current capabilities versus planned features.
- TODO items map to roadmap phases and are not represented as completed work.
- No live trading/execution behavior is added by this PRD.

## 13. Out of scope

- Guaranteed price prediction or returns.
- Autonomous investment decisions or personalized financial advice.
- Live order execution.
- Unreviewed imported Pine Script strategies.
- Treating screenshots or LLM output as numeric source of truth.
