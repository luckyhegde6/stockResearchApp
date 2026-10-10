# Stock Research Pipeline v1.47

v1.47 is the final deterministic-to-LLM handoff release.

## Core principle

Everything before the final LLM call is deterministic:

`NSE/Screener/Tijori/TradingView/optional Chartink → normalization → reconciliation → MarkItDown → evidence contract → analysis evidence pack → readiness`

The LLM receives the finished evidence package and performs investment reasoning only.

## Single command

```cmd
npm run analyze -- ITC
npm run analyze -- COALINDIA
npm run analyze -- BEL
```

## Reasoning sources

- NSE: source of record for exchange/security and official market/filing evidence.
- Screener/Tijori: structured financial and contextual cross-checks.
- TradingView: visual technical evidence.
- Chartink: optional point-in-time screen membership.
- BSE: excluded from production analysis.

## Prompt files

- `skills/stock-analysis/SKILL.md`
- `skills/stock-analysis/ANALYSIS_PROMPT.md`
- `skills/stock-analysis/JSON_SCHEMA.md`

## Validation

```cmd
npm run test:investment-reasoning-contract
npm run test:reasoning-readiness-rules
```
