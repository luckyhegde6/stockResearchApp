# Evidence Contract v1.16

`evidence-contract.json` is the canonical hand-off object between deterministic acquisition/normalization and the final LLM.

## Value rules
- Important source fields contain actual values whenever deterministic extraction can produce them.
- Values include source, source artifact, extraction/calculation method, verified flag, as-of timestamp, evidence path, source URL when known, and confidence.
- `presence_validation` is not a substitute for a canonical value.
- Deterministic metrics such as EMA50, EMA200 and RSI14 are calculation evidence, not TradingView observations.

## Sections
- `FACTS`: observed source values.
- `CALCULATED_METRICS`: script-calculated values.
- `SOURCE_EVIDENCE`: documents/artifacts and provenance.
- `DATA_QUALITY`: actual validation measurements.
- `CONFLICTS`: cross-source disagreements that need resolution.
- `WARNINGS`: actionable or informational operational limitations.
