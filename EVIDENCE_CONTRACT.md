# Evidence Contract

`evidence-contract.json` is the canonical deterministic index used by the final investment-analysis prompt.

Each important input carries:

- field
- value
- unit where applicable
- source
- sourceArtifact
- method
- verified
- asOf where available
- evidencePath / sourceUrl where available

## Method semantics

`source_extraction` = directly observed from a provider's response/page.

`deterministic_calculation` = calculated by application code from validated source data.

`presence_validation` = deterministic evidence availability check.

`cross_source_comparison` = deterministic comparison between source-derived inputs.

`pipeline_status` = operational status/warning information.

The contract intentionally separates source facts from model interpretation.

## Example entry

```json
{
  "id": "technical-ema50",
  "kind": "calculated_metric",
  "field": "ema50",
  "value": 1310.4106,
  "unit": "price",
  "source": "NSE",
  "sourceArtifact": "tradingview-technical-normalized",
  "method": "deterministic_calculation",
  "verified": true,
  "asOf": "2026-08-27",
  "evidencePath": "research/RELIANCE/raw/tradingview/technical-normalized.json"
}
```
