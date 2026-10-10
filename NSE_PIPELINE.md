# NSE acquisition architecture

## Required data path

NSE JSON API is the primary source for:

- quote
- trade info
- financial results
- corporate announcements
- corporate actions
- 3-year historical price/volume/delivery data

Playwright is used only for:

- annual-report filing discovery and download
- shareholding filing discovery and extraction
- quote-page audit screenshot when the quote API fails

The quote webpage is not a primary dependency.

## Why Playwright is still needed

The NSE filing pages are dynamic. The adapter listens to the page's API/network responses and captures relevant JSON responses in addition to DOM links/text. This avoids depending on a single CSS selector.

## Runtime requirements

```powershell
npm install
npx playwright-cli install-browser
npx playwright-cli install --skills
```

The project resolver also tries the local CLI, `npx --no-install`, and finally an ephemeral `npx --package=@playwright/cli@latest` fallback unless `PLAYWRIGHT_ALLOW_EPHEMERAL=false`.

## Test

```powershell
npm run research:nse -- RELIANCE
```

## TradeNext reference

The NSE client pattern is based on the current TradeNext implementation: a cookie jar, homepage session warm-up, browser-like `Accept`/`User-Agent`/`Referer` headers, bounded retries, and the unified endpoint family used by its NSE API service. See `nse-client.ts` and `nse-api.ts` in the TradeNext repository.

## v1.12 historical chunking

NSE security-wise historical data is acquired in bounded date chunks instead of assuming one 3-year request will return the full range. Default values:

- `NSE_HISTORICAL_CHUNK_DAYS=85`
- `NSE_HISTORICAL_OVERLAP_DAYS=2`

Each chunk is archived under `raw/nse-api/historical-chunks/`, then merged, filtered to `EQ`, deduplicated by symbol + series + trading date, sorted chronologically, and validated against requested date coverage.

The validation checkpoint reports requested range, chunk count, successful chunks, raw rows, EQ rows, earliest/latest dates, coverage ratio, duplicate dates, and series counts.
