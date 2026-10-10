# Google Sheets Architecture & Reasoning

## 1. Why Google Sheets is a publication layer

The research pipeline generates structured artifacts locally. Those artifacts are more suitable as the canonical source because they are machine-readable, versioned and testable.

Google Sheets is optimized for:

- human review
- filtering
- sharing
- quick comparison
- visual inspection
- operational monitoring

It should therefore be treated as a **published view of research**, not as the research database.

## 2. Why one consolidated sheet per run

The earlier design could spread one run across multiple tabs.

That creates several problems:

- readers must navigate between tabs
- row relationships become implicit
- screenshots become detached from the finding they support
- exporting the same run becomes harder to audit
- repeated metadata appears across multiple tabs

The consolidated design puts SUMMARY, EVIDENCE, SOURCES, FINDINGS, QUALITY and SCREENSHOTS into one tab.

The result is closer to a research dossier:

`run → summary → evidence → sources → findings → quality → visual evidence`

The workbook's `StockResearch` tab acts only as an index.

## 3. Why command-run sheets were removed

Execution lifecycle information is operational telemetry, not research evidence.

Publishing `command-runs-*` tabs mixed:

- engineering process state
- research data
- user-facing investment information

Keeping command reports local provides the same diagnostic capability without polluting the research workbook.

Similarly, an `_EXPORT_LOG` tab is unnecessary when the workbook index and local export reports already identify published runs.

## 4. Why screenshots are not numeric evidence

A screenshot can demonstrate what a chart or website looked like.

It should not be treated as the authoritative source of:

- price
- market capitalization
- revenue
- EPS
- RSI
- moving averages
- valuation ratios

Those should come from structured acquisition artifacts or deterministic calculations.

Screenshots are retained for provenance and visual review.

## 5. Why optimization happens before Apps Script

Apps Script has a Blob-size limitation and image pixel constraints.

Sending an original browser screenshot creates a fragile integration because a perfectly valid local image can still be rejected by the receiver.

The exporter therefore performs:

`original → dimension reduction → JPEG re-encoding → base64 → Apps Script`

The receiver repeats the important safety checks.

This is deliberate defense in depth.

## 6. Why the receiver checks the image again

The client/exporter cannot be the only enforcement point.

A future caller, bug, configuration change or alternate exporter could send an oversized image.

Apps Script therefore validates:

`bytes ≤ 1,800,000`

and

`width × height ≤ 1,000,000`

before creating the Blob/inserting the image.

## 7. Why status fields are synchronized

A screenshot can have several states:

- discovered
- optimized
- pending embedding
- embedded
- failed
- skipped

The previous sheet could expose contradictory states, for example:

`embedding_status = embedded_in_sheet`

while:

`status = pending_embedding`

That makes automation and human review unreliable.

The receiver now updates:

- `value`
- `status`
- `embedding_status`

together after the actual insertion attempt.

## 8. Why evidence fallback exists

The research pipeline may produce deterministic canonical evidence even when an optional analysis handoff artifact is unavailable.

The exporter therefore falls back to:

`normalized/canonical-values.json`

when:

`normalized/analysis-evidence-pack.json`

is absent.

This does **not** mean the exporter invents missing evidence.

It only exposes evidence that already exists in a deterministic artifact.

Readiness gates remain authoritative.

## 9. Why conflicts are preserved

Different providers can report different values because of:

- reporting period
- unit scaling
- consolidated vs standalone statements
- stale page data
- source extraction differences
- timing

The exporter should not silently choose one.

Instead, the conflict remains visible so the research layer can determine whether it is:

- a real disagreement
- a unit mismatch
- a period mismatch
- a stale value
- an unresolved issue

This is critical for investment reasoning.

## 10. Failure isolation

The architecture intentionally separates:

`research correctness`

from:

`publication availability`

A Google Sheets outage must not destroy or invalidate the locally generated research artifact.

That allows the publishing layer to be retried independently.
