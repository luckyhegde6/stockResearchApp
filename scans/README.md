# Long-Lived Market Scan Archive

This directory is intentionally **not** removed by `npm run research -- <TICKER>`.

Each execution creates a dated directory:

```text
Fundamental-DD-MM-YYYY/
Candlestick-DD-MM-YYYY/
Range-Breakouts-DD-MM-YYYY/
Bullish-DD-MM-YYYY/
Bearish-DD-MM-YYYY/
Intraday-DD-MM-YYYY/
52-Week-High-DD-MM-YYYY/
```

The archive is deterministic input for future market analysis. No final investment prompt or LLM reasoning is performed here.
