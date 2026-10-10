# Individual Stock Walkthrough — v1.37

Example:

```cmd
npm run analyze -- ITC
```

Pipeline:

```text
NSE security master validation
  -> NSE / Screener / Tijori / TradingView / Chartink acquisition
  -> deterministic normalization
  -> individual-stock evidence
  -> cross-source reconciliation
  -> MarkItDown document ingestion
  -> evidence contract
  -> analysis inputs
  -> readiness gate
  -> final LLM reasoning
```

The final LLM should receive the compact evidence contract and analysis inputs. It should not be responsible for discovering ticker identity, parsing CSVs, calculating EMA/RSI, or deciding which source is authoritative.
