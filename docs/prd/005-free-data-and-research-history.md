
# PRD-005 — Free Data Enrichment & Point-in-Time Research History

- Status: Proposed / discovery-ready; not yet in implementation
- Priority: P1 foundations followed by P1 research features
- Last reviewed: 2026-10-15
- Depends on: PRD-001 deterministic research, PRD-004 evidence/readiness contracts

## 1. Goal

Improve India-equity research depth with freely accessible or zero-cost sources while preserving provenance, period comparability, legal/usage limits and reproducibility. Make completed research runs comparable across time. This does not promise every source is free for every use or that an API quota remains unchanged.

## 2. Sources to evaluate

1. **TejHQ / tej-bazaar / tej-api** — documented keyless EOD OHLCV, date snapshots and corporate actions; documented free-key adjusted prices/symbol history. Verify completeness, adjustment methodology, quotas and data-use terms before production.
2. **NSE corporate filings/announcements** — primary source links for events and issuer attachments. Automated access, redistribution and commercial use must comply with current NSE terms.
3. **Official issuer investor-relations pages** — annual reports, quarterly results and presentations, preserving source artifacts and exact URLs.
4. **Google News RSS/public article pages** — supplementary discovery; issuer/exchange filings remain preferred confirmation.
5. **Yahoo Finance/yfinance** — optional diagnostic for personal/research comparison pending terms review, not a production data entitlement.

## 3. Functional scope

### P0 — Source registry and capability policy

Maintain a machine-readable registry with provider ID, source role, data classes, credentials, freshness, quota, terms/license URL, allowed purpose, review date and feature flag. CI rejects adapters without explicit policy. Distinguish free-to-access, free-to-use, and redistributable.

### P1 — Secondary EOD and corporate actions

Implement an opt-in adapter for OHLCV, snapshots and actions. Store raw payloads unchanged with checksum, URL, retrieval timestamp and provider metadata; normalize to a stable schema; cross-check against existing source artifacts. Do not silently change precedence.

### P1 — Comparable point-in-time runs

Add stable run identity, as-of dates, source versions/checksums and schema versions. Compare only compatible units, currency, financial periods, reporting scope and adjusted/unadjusted basis. Emit deterministic deltas and quality changes without relying on model-written narrative.

### P1 — Source-linked event timeline

Normalize announcements to event type, announced timestamp, effective date only when sourced, source URL, artifact ID and confirmation status. Keep source fact separate from interpreted materiality.

### P2 — Decision research surfaces

Add peer scorecard and valuation sensitivity after comparability is tested; add reproducible backtesting after adjusted point-in-time bars exist.

## 4. Non-functional requirements

- Bounded timeouts, concurrency, quota-aware pacing and respectful retry/backoff.
- No access-control or anti-bot bypass.
- Raw evidence immutable; normalization reproducible.
- Provider outage produces explicit source-health state.
- Missing facts remain unavailable.
- No new paid dependency required for baseline research.
- Provider output cannot override readiness or canonical source precedence by itself.

## 5. Acceptance criteria

- Every source has current tier/terms metadata and explicit allowed-use decision.
- Adapter fixtures cover normal, malformed, missing, stale, duplicate and outage responses.
- OHLCV obeys price invariants and trading-calendar checks.
- Cross-source mismatches are visible; primary data is never overwritten.
- Point-in-time diff rejects incompatible periods/scopes/price bases.
- Event records retain source artifact and timestamp precision.
- Tests prove source failures cannot turn readiness to ready.
- Docs distinguish current, planned and externally unverified functionality.

## 6. Out of scope

Real-time licensed feeds; bypassing access controls; unlicensed redistribution; autonomous recommendations or execution based only on experimental data; ML forecasting before leakage-aware baselines.

## 7. Suggested delivery slices

1. Source registry and data-quality contract.
2. Read-only secondary EOD/corporate-actions adapter behind opt-in flag.
3. Parity and freshness report.
4. Versioned research snapshots.
5. Deterministic “What Changed?” report.
6. Corporate-event timeline.
7. Peer/sensitivity and backtest groundwork.
