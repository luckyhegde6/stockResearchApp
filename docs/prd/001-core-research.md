# PRD-001 — Core Research

## Objective

Produce an auditable NSE-first research package for one equity without requiring an LLM during acquisition.

## P0 requirements

- Resolve supported inputs to an NSE EQ security.
- Acquire NSE, Screener, Tijori, and TradingView evidence.
- Preserve raw artifacts and provenance.
- Normalize and reconcile source data deterministically.
- Produce canonical financial/market/technical/ownership/screening/catalyst evidence.
- Produce source health, evidence quality, evidence contract, evidence bundle, and readiness.
- Block final reasoning when required evidence is missing or materially invalid.
- Validate final model output against src/schema.ts.

## P1 requirements

- Support supplementary News and optional Chartink.
- Keep failures source-local and diagnosable.
- Keep model-provider integration replaceable.

## Non-goals

- Broker execution.
- Silent source substitution.
- Primary numeric extraction from screenshot pixels.
