# Agent Guide

Companion to root AGENTS.md. Keep this file detailed but context-efficient.

## Recommended context sequence

```text
AGENTS.md
  ↓
MEMORY.md
  ↓
HANDOFF.md
  ↓
relevant source/tests
  ↓
one focused docs file
```

Avoid loading the entire docs tree.

## Preferred evidence context

For a researched symbol, read in this order:

1. research/SYMBOL/manifest.json
2. research/SYMBOL/analysis-readiness.json
3. research/SYMBOL/normalized/analysis-evidence-pack.json
4. research/SYMBOL/normalized/analysis-inputs.json
5. research/SYMBOL/normalized/reconciliation.json
6. source-health.json and evidence-quality.json
7. raw PDFs/HTML/screenshots only when required for provenance or missing detail

## Safe defaults

Good:
- inspect code, config, contracts, and tests
- run focused deterministic checks
- run one-symbol research when requested
- inspect normalized evidence
- update source/tests/docs
- create a concise handoff

Require explicit intent:
- changing credentials
- deleting evidence
- changing source precedence
- weakening readiness rules
- changing the final analysis schema
- adding new external integrations

## Task completion record

```text
Goal:
Changed:
Tests:
Known limits:
Next:
```

## Future agent interface

Prefer a small machine-readable repo manifest and read-only evidence CLI over more prompt text. Stable tools should expose research, readiness, source health, and result inspection without exposing secrets.
