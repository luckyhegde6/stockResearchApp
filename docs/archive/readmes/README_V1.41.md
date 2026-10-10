# Stock Research Pipeline v1.41

v1.41 is the final deterministic individual-stock evidence completeness release before the final investment-analysis prompt is introduced.

## Flow
`research -- TICKER` → normalization → evidence quality → canonical contract → analysis-inputs → MarkItDown → evidence pack → readiness → later LLM reasoning.

## Commands
- `npm run stock:evidence -- ITC`
- `npm run test:individual-stock-evidence -- ITC`
- `npm run evidence:quality -- ITC`
- `npm run test:evidence-completeness -- ITC`
- `npm run prepare:analysis -- ITC`
- `npm run analyze -- ITC`

## Core outputs
`research/ITC/normalized/identity.json`
`market.json`
`financials.json`
`financial-periods.json`
`valuation.json`
`ownership.json`
`technicals.json`
`screening.json`
`catalysts.json`
`canonical-values.json`
`reconciliation.json`
`individual-stock-evidence.json`
`analysis-inputs.json`

The final LLM is not part of acquisition or normalization.
