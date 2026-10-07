# NSE API Implementation

This pipeline now uses a dedicated deterministic NSE HTTP client modeled on the acquisition pattern in the TradeNext project.

## TradeNext pattern referenced

TradeNext's `lib/nse-client.ts`:

1. Creates a persistent `CookieJar` using `tough-cookie` and `fetch-cookie`.
2. Warms the session by requesting `https://www.nseindia.com/` when the cookie jar is empty.
3. Sends browser-like `User-Agent`, `Accept`, `Accept-Language`, and `Referer` headers.
4. Uses request and overall abort timeouts.
5. Retries transient failures with exponential backoff.
6. Returns JSON from NSE's `/api/...` endpoints.

TradeNext's `lib/nse-api.ts` then wraps endpoint-specific functions such as quote, corporate announcements, corporate actions, financial results and security-wise historical data.

## Endpoints used by this project

| Purpose | NSE endpoint |
|---|---|
| Quote | `/api/quote-equity?symbol=SYMBOL` |
| Trade info | `/api/quote-equity?symbol=SYMBOL&section=trade_info` |
| Financial results | `/api/results-comparision?index=equities&symbol=SYMBOL` |
| Corporate announcements | `/api/corporate-announcements?index=equities&symbol=SYMBOL` |
| Corporate actions | `/api/corporates-corporateActions?index=equities` |
| Historical OHLCV + deliverable | `/api/historicalOR/generateSecurityWiseHistoricalData` with `from`, `to`, `symbol`, `type=priceVolumeDeliverable`, `series=ALL` |

## Why this is better than scraping the quote page

The JSON endpoints provide machine-readable values without needing the model or DOM text interpretation. The code stores both:

- the raw API response; and
- a normalized, smaller analysis-ready JSON representation.

The page-level Playwright captures remain as an audit/fallback layer for exchange filing pages such as annual reports and shareholding patterns.

## No LLM in this stage

All API calls, normalization, storage, and historical calculations are deterministic TypeScript. The LLM is only invoked by `npm run analyze -- SYMBOL` after acquisition and MarkItDown ingestion are complete.

## Operational safeguards

Do not bypass CAPTCHA, authentication, rate limits, robots restrictions, or other access controls. If an endpoint is unavailable, record a data gap and continue with permitted fallback sources.
