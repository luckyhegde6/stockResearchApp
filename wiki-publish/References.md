# References and Glossary

## First-party project references

- [Source repository](https://github.com/luckyhegde6/stockResearchApp)
- [Repository documentation](https://github.com/luckyhegde6/stockResearchApp/tree/main/docs)
- [Architecture](https://github.com/luckyhegde6/stockResearchApp/blob/main/docs/ARCHITECTURE.md)
- [CLI reference](https://github.com/luckyhegde6/stockResearchApp/blob/main/docs/CLI_REFERENCE.md)
- [Evidence contract](https://github.com/luckyhegde6/stockResearchApp/blob/main/docs/EVIDENCE_CONTRACT.md)
- [Google Sheets publishing plan](https://github.com/luckyhegde6/stockResearchApp/blob/main/docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md)
- [PRD index](https://github.com/luckyhegde6/stockResearchApp/blob/main/docs/PRD.md)
- [TODO backlog](https://github.com/luckyhegde6/stockResearchApp/blob/main/TODO.md)
- [Architecture decisions](https://github.com/luckyhegde6/stockResearchApp/blob/main/DECISIONS.md)

## External references

### GitHub Wiki, Markdown and diagrams
- [GitHub: Add or edit Wiki pages](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
- [GitHub: images and diagrams in Wiki content](https://docs.github.com/en/communities/documenting-your-project-with-wikis/editing-wiki-content)
- [GitHub: creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)

### Indian-equity research sources
- [NSE corporate filings and announcements](https://www.nseindia.com/companies-listing/corporate-filings-announcements)
- [NSE data usage policy](https://www.nseindia.com/static/market-data/nse-data-policy)
- [TejHQ API documentation](https://tejhq.dev/docs)
- [TejHQ open-source pipeline](https://github.com/tejhq/tej-bazaar)
- [yfinance project](https://github.com/ranaroussi/yfinance)
- [Google News RSS search](https://news.google.com/rss/search?q=ITC%20stock&hl=en-IN&gl=IN&ceid=IN:en)

### Model/runtime/validation
- [Ajv JSON Schema validation](https://ajv.js.org/)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Node.js](https://nodejs.org/docs/latest/api/)

## Glossary

| Term | Meaning |
|---|---|
| Raw artifact | Preserved source response, page, file or screenshot with retrieval context |
| Canonical evidence | Normalized source facts, deterministic metrics and reconciliation used downstream |
| Provenance | Where evidence came from, how/when it was acquired, and how a value was derived |
| As-of time | When a value or fact should be considered valid or known |
| Reporting period | Fiscal/quarter/year period to which a financial value applies |
| Reconciliation | Comparison of overlapping values while preserving unresolved disagreement |
| Readiness gate | Deterministic check deciding whether evidence can enter final model reasoning |
| Evidence quality | Completeness/validity indicators for acquired and normalized fields |
| Investment conviction | Strength of an investment thesis, distinct from input-data confidence |
| Point-in-time data | Data limited to what would have been known at a historical date |
| Survivorship bias | Bias caused by using only securities that survived into today's universe |
| Lookahead bias | Using information unavailable at the simulated decision time |
| Repainting | A trading signal changing after the apparent signal time |
| Adjusted price | Historical price altered for specified corporate actions; method must be known |
| EOD | End of day |
