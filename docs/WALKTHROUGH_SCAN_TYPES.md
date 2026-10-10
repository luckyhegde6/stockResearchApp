# Walkthrough — Scan Types

## Fundamental

Purpose: identify stocks from the requested fundamental-oriented Chartink screen set.

Output: all configured strategy CSV/table rows, normalized rows, deduplicated symbol universe and top-20 consensus.

## Candlestick

Purpose: capture pattern-based screens such as Doji, Tweezer Bottom, Marubozu, Harami, Piercing and Engulfing patterns.

Evidence: source scan data plus TradingView 1D/5Y/All screenshots for scan-result symbols.

## Range Breakouts

Purpose: range compression, breakout and technical-trigger scans including NR7, Bollinger, moving-average, Ichimoku and Supertrend screens.

Evidence: source scan data plus TradingView visual evidence.

## Bullish

Purpose: collect independent bullish trend, momentum, divergence and pattern scans.

Evidence: source scan data plus TradingView visual evidence.

## Bearish

Purpose: collect independent bearish, sell, downtrend and reversal scans.

Evidence: source scan data plus TradingView visual evidence.

## Intraday

Purpose: intraday long/short/option/futures setup scans.

Important: the exact point-in-time scan timestamp is retained. These signals are transient and must not be interpreted as timeless stock attributes.

## NSE 52-Week High

This is a separate exchange-derived market scan. It is not a Chartink strategy. The raw NSE API response and normalized EQ list are retained under a dated `52-Week-High-DD-MM-YYYY` directory.
