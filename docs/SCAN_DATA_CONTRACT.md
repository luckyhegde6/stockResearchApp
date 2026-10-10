# Market Scan Data Contract

Every long-lived scan archive must preserve four layers:

1. Scan definition — name, URL, category and captured rule/scan clause.
2. Scan result — raw CSV/copy/table evidence and normalized rows.
3. Scan evidence — source timestamp, retrieval time, page screenshot, TradingView evidence when requested.
4. Derived outputs — deduplicated universe and deterministic Top-20/consensus ranking.

A scan result is not an investment recommendation. Its membership is point-in-time evidence.

## Status semantics

- `ok`: acquisition succeeded and valid rows were normalized.
- `partial`: source responded but completeness or semantic validation is incomplete.
- `failed`: no usable evidence was acquired.
- `not-run`: no dated archive for that family exists.

Zero normalized rows can never imply `ok`.

## TradingView

A screenshot can be retained even when candlestick-selection cannot be verified. `candleSelectionVerified=false` must prevent a textual claim that the screenshot is proven to be candlestick mode.
