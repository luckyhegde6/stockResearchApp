# Google Sheets Architecture & Reasoning

## 1. Publication layer and canonical evidence

The research pipeline generates structured local artifacts. Those artifacts remain canonical, versioned and testable; Google Sheets is the human-review and sharing layer, not the research database.

The workbook should function like an analyst's evidence-backed stock research note. A reader should move from executive view to market, statements, fundamentals, valuation, technicals, events/news, investment reasoning, sources, quality and chart evidence without needing to inspect raw local files.

## 2. Decision-ready, not just machine-readable

The publication contract should cover:
- executive stance, time horizon, confidence and why the stance follows from evidence
- current price and price-action/volume context
- earnings and financial-statement summary
- fundamental business quality and valuation
- traceable technical indicators
- upcoming results/board dates and corporate actions
- recent material news with source URLs
- bull/base/bear cases, catalysts, risks and thesis invalidation
- data freshness, missing evidence and unresolved source conflicts

The exporter must not fabricate fields to make the workbook look complete. If local artifacts do not contain a metric, date or headline, publish a clear missing/unconfirmed state and show its impact on readiness/confidence.

## 3. One consolidated tab per run

The consolidated design keeps the report navigable without splitting one run across many tabs. Current section headings include SUMMARY, EVIDENCE, SOURCES, FINDINGS, QUALITY and SCREENSHOTS; analysis reports also contain SCORES, RISKS, CATALYSTS, SCENARIOS and AUDIT. Future refinements should preserve the single-run-tab acceptance criterion.

Recommended reading order is executive view, price/volume, earnings/financials, fundamentals/valuation, technicals, events/news, findings/risks/scenarios, sources/quality, screenshots.

## 4. Facts vs calculations vs interpretation

Keep three classes clearly distinguished:
1. **Sourced facts** — provider, source URL, reporting period and retrieval/as-of timestamp.
2. **Deterministic calculations** — formula/method, inputs/window and calculation timestamp.
3. **Analyst interpretation** — explicit rationale, confidence, counter-evidence, risks and thesis-invalidation conditions.

A screenshot is visual/provenance evidence. It is not the authoritative numeric source for price, volume, EPS, RSI or moving averages.

## 5. Screenshot compression and receiver safety

The exporter performs:

`original → decode → resize as needed → JPEG re-encode → byte check → base64 → Apps Script → insert`

Current code targets <=900,000 pixels, tries progressively lower JPEG quality and reduces dimensions further if needed, defaults to a 1.4 MB per-image cap and 5 MB total payload, and limits the batch to eight screenshots by default. Apps Script rechecks bytes <=1.8 MB and pixels <=1,000,000 before creating a Blob.

The metadata row retains original and optimized size/dimensions and encoding quality. Insertion results synchronize `value`, `status` and `embedding_status` to avoid contradictory statuses.

Source code implementation is not proof of live success: deploy Apps Script, run `npm run sheets:doctor`, export a known symbol, inspect `screenshotsEmbedded/screenshotsFailed`, then open the workbook and verify actual image objects.

## 6. Evidence fallback and conflicts

If optional `normalized/analysis-evidence-pack.json` is missing, the exporter may publish existing deterministic data from `normalized/canonical-values.json` or normalized individual-stock evidence. This fallback never creates new facts or bypasses readiness gates.

When providers disagree, preserve the conflict and investigate period, units, currency, consolidation basis, definition and freshness before interpretation. Do not silently choose a value just to avoid an unresolved conflict.

## 7. Failure isolation and investment safety

Research correctness is separate from publication availability. A Google Sheets outage should not invalidate the local artifact. Never publish credentials or local filesystem paths. Keep reporting separate from order execution.

The report informs a decision but is not a guaranteed forecast. Recommendation confidence must be no greater than the evidence confidence; critical gaps should cause a conditional view or `NO CALL`, not false precision.
