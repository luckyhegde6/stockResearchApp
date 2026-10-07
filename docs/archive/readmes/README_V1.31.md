# Stock Research Pipeline v1.31

## Deterministic preparation boundary

This release fixes the v1.30 `writeText is not defined` failure and makes analysis preparation idempotent.

### Required sequence

`npm run research -- ITC`

then:

`npm run prepare:analysis -- ITC`

then, only when readiness is `true`:

`npm run analyze -- ITC`

## v1.31 focus

- canonical source facts
- deterministic calculations
- cross-source reconciliation
- evidence quality
- MarkItDown ingestion
- visual evidence inventory
- readiness gate before LLM

No LLM is used before the final `analyze` command.
