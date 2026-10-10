# Architecture Decisions

Compact ADR-style history. Add a dated entry; do not rewrite older decisions.

## D-001 — Deterministic evidence before AI
Status: accepted

Acquire, normalize, reconcile, quality-check, and gate evidence before calling an LLM.

## D-002 — NSE-first source hierarchy
Status: accepted

NSE is primary. Screener and Tijori are complementary. TradingView supplies chart/public-page evidence. News is supplementary. BSE is excluded from production stock research.

## D-003 — Preserve raw provenance
Status: accepted

Raw source material remains under research/SYMBOL/raw/ while later stages derive normalized artifacts.

## D-004 — Readiness is a model boundary
Status: accepted

Final reasoning is blocked when required deterministic evidence is missing or materially invalid, unless the explicit partial-evidence override is used.

## D-005 — TradingView direct public routes
Status: accepted in v1.50.0

Public surface capture uses centrally generated direct symbol-page URLs and does not depend on Metrics/More launcher DOM.

## D-006 — Compact reasoning handoff
Status: accepted

Use normalized/analysis-evidence-pack.json and related deterministic summaries before large raw evidence files.

## D-007 — Agent-neutral contract
Status: accepted

The repository contract is files + CLI + schemas + deterministic artifacts, not a specific model vendor or agent SDK.
