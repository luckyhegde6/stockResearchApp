# Google Sheets Data Contract

## Consolidated research tab

Each run tab contains labelled sections.

### SUMMARY

Run-level identity and health:

- ticker
- company
- generated timestamp
- readiness
- evidence counts
- source counts
- warning counts
- conflict counts

### EVIDENCE

Deterministic facts and calculated metrics.

Typical fields:

- evidence type
- field
- value
- unit
- source
- source artifact
- as-of
- reporting period
- confidence
- verified
- notes

### SOURCES

Source provenance.

Typical information:

- provider
- source title
- URL
- source type
- acquisition status
- artifact identifier
- notes

Local filesystem paths are excluded.

### FINDINGS

Research interpretations supported by the evidence.

A finding should not silently become a raw fact.

### QUALITY

Quality and readiness information.

Examples:

- missing artifacts
- source warnings
- unresolved conflicts
- readiness state
- quality score/components

### SCREENSHOTS

Visual evidence metadata plus the embedded image.

Important fields:

- filename
- original size
- optimized size
- original dimensions
- optimized dimensions
- optimization occurred
- compression quality
- status
- embedding status

## Index

`StockResearch` is the navigation index.

It should point to generated run tabs but should not duplicate the complete research dataset.

## No command-run sheets

Command lifecycle records are intentionally not part of the research workbook.

They remain in local output/report structures.

## No export log sheet

Publication itself is represented through the run index and exporter result.

A separate `_EXPORT_LOG` sheet would duplicate operational metadata and make the workbook harder to read.
