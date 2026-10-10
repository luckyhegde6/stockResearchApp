# Stock Research Pipeline v1.39

## Analysis Evidence Pack

v1.39 adds a deterministic, compact analysis evidence pack for individual stocks. The pack is generated only after acquisition, normalization, reconciliation and MarkItDown ingestion. It does not call the LLM.

Production sources remain NSE, Screener, Tijori, TradingView and Chartink. BSE is excluded.

### One-command stock analysis

```cmd
npm run analyze -- ITC
```

The orchestrator runs research, preparation, MarkItDown ingestion, canonicalization, reconciliation, evidence-pack creation and readiness checks before the final LLM boundary.

### Evidence-pack command

```cmd
npm run evidence:pack -- ITC
```

Outputs:

- `research/ITC/normalized/analysis-evidence-pack.json`
- `research/ITC/markdown/ANALYSIS_EVIDENCE_PACK.md`

### Pack sections

- Identity
- Canonical source facts
- Deterministic calculated metrics
- Financial-period evidence
- Screening context
- Catalysts
- Cross-source reconciliation
- Source health and quality
- Market-scan context
- Source freshness / provenance
- MarkItDown document index
- Visual evidence index
- Analysis file map

### Provenance rules

Every canonical value should retain its source, artifact, method and as-of timestamp when available. Calculated values use `deterministic_calculation`; observed source values use `source_extraction`.

### Visual evidence

TradingView images are preserved as visual evidence. They are not converted into numeric facts by pixel inference.

### Market scans

Long-lived market scans remain under `scans/`. Individual stock evidence remains under `research/<TICKER>/` and can be wiped/rebuilt.

### Validation

```cmd
npm run test:analysis-evidence-pack -- ITC
npm run test:canonical-evidence
npm run test:individual-stock-evidence -- ITC
```
