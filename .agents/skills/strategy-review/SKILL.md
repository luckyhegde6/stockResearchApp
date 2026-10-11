# Skill: Strategy Review

Before accepting a strategy/backtest:
- Verify signal/trade timing avoids same-bar and lookahead leakage.
- Inspect repainting, survivorship bias, corporate actions, missing bars, and universe selection.
- Require out-of-sample evaluation and benchmark.
- Model brokerage, fees/taxes where applicable, slippage, liquidity, and market-impact assumptions.
- Report CAGR, volatility, drawdown, risk-adjusted metrics, exposure, turnover, sample size, and limitations where supported.
- Use reproducible dataset/strategy versions.
- Keep strategy research offline. Never execute orders.