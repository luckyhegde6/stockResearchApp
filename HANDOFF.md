# Handoff

Updated: 2026-10-08
Branch: init
PR: #1 → main

## Current state

The repository is in a documentation and developer-experience hardening phase around v1.50.0.

Completed:
- TradingView production capture uses direct public symbol-page routes.
- TradingView surface URL generation is centralized.
- Legacy Metrics/More launcher code/tests were removed.
- README is the main project operating guide.
- Source policy is NSE-first; BSE is excluded from production stock research.
- Deterministic acquisition is separated from final AI reasoning.
- Evidence quality and readiness are part of the normal handoff.
- Canonical agent memory, handoff, TODO, decision, PRD, GitHub templates, and a machine-readable agent-manifest.json were added.
- Lightweight GitHub CI now runs version:check and test:all.

## Immediate priorities

1. Keep docs synchronized with package.json and src/index.ts.
2. Add deeper readiness regression coverage.
3. Keep agent handoffs compact; prefer normalized evidence over raw dumps.
4. Split orchestration code only when a concrete maintenance need appears.
5. Add agent-facing functionality behind stable file/CLI contracts.

## Caution areas

- Provider websites may fail independently.
- Browser smoke tests do not prove live provider availability.
- Research data is intentionally ignored by Git.
- analyze performs a fresh deterministic acquisition before the LLM call.

## Handoff protocol

Record exact paths, tests run, known limits, and the next action. Do not paste large logs or secrets into this file.
