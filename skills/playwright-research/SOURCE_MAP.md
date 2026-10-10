# Source map

The six-document workflow uses these source families:

| Evidence | Primary source | Secondary/fallback |
|---|---|---|
| Annual report | NSE Corporate Filings → Annual Reports | BSE / company investor relations |
| MDA | Annual report section | Company annual-report HTML |
| Concall | Screener.in Concalls | Tijori Finance Conference Call |
| Technical chart | TradingView NSE symbol | Exchange chart / broker chart |
| Fundamental snapshot | Screener.in | Tijori Finance |
| Shareholding | NSE Corporate Filings → Shareholding Pattern | BSE / company filing |

For each artifact preserve source URL, retrieval timestamp, local path, period and status. The application must prefer the primary source when conflicting data exists.
