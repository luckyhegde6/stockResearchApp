# v1.48 News, Sentiment and TradingView Symbol Snapshot

## Sources

1. TradingView News Flow
   - URL pattern: `https://news-mediator.tradingview.com/public/news-flow/v2/news`
   - filters: `lang:en`, `symbol:NSE:<SYMBOL>`, `client=chart`, `user_prostatus=non_pro`
   - cursor pagination is bounded by `NEWS_TV_MAX_PAGES`.
2. Google News RSS
   - URL pattern: `https://news.google.com/rss/search?q=...&hl=en-IN&gl=IN&ceid=IN:en`
   - used as a discovery/cross-check feed; headline metadata only.
3. NSE Corporate Announcements
   - reused from the already captured NSE NextApi announcement payload.
4. TradingView symbol scanner
   - structured point-in-time fields from `https://scanner.tradingview.com/symbol`.

## Storage

- `raw/news/tradingview-news.json`
- `raw/news/google-news-rss.xml`
- `raw/news/google-news-rss-normalized.json`
- `normalized/news-sentiment.json`
- `raw/tradingview/symbol-scanner.json`
- `raw/tradingview/symbol-scanner-normalized.json`

## Sentiment methodology

The sentiment layer is deterministic and headline based. It scores a controlled positive/negative lexicon and weights recent headlines more heavily. It also records source count, provider diversity, theme signals and positive/negative/neutral counts.

It must be described as headline sentiment only. It is not a substitute for reading the article, verifying the underlying event, or making an investment recommendation.

## Environment

- `NEWS_ENABLE_GOOGLE_RSS=true|false`
- `NEWS_TV_MAX_PAGES=3`
- `NEWS_GOOGLE_MAX_ITEMS=40`
- `NEWS_NSE_MAX_ITEMS=200`
- `NEWS_MAX_STORED_HEADLINES=100`

## Commands

`npm run research:news -- BEL`

`npm run test:news-sentiment`

`npm run analyze -- BEL`
