# Stock Research Pipeline v1.33

## One-command analysis

Use:

```cmd
npm run analyze -- ITC
```

This now runs the complete deterministic acquisition pipeline, then the deterministic analysis-preparation pipeline, and only then invokes the LLM if the readiness gate passes.

No BSE dependency exists in the production pipeline.

### Useful standalone commands

```cmd
npm run research -- ITC
npm run prepare:analysis -- ITC
npm run tradingview-doctor -- ITC
npm run research:chartink -- ITC
npm run research:nse-market -- ITC
```

### Readiness

Check:

```text
research\ITC\analysis-readiness.json
```

The LLM boundary is crossed only when `ready=true`.
