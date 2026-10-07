# NSE acquisition fixes in 1.10

This version addresses the problems observed in the 1.9.1 RELIANCE run.

## 1. Quote acquisition

Primary:
- `/api/quote-equity?symbol=SYMBOL`
- `/api/quote-equity?symbol=SYMBOL&section=trade_info`

Fallbacks:
1. NSE `NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=SYMBOL`.
2. Playwright capture of JSON traffic from NSE's `market-data/live-equity-market` page, filtering for the requested symbol.
3. The legacy `/get-quote/equity/SYMBOL` page is an audit-only final fallback.

The alternate GetQuoteApi path is retained as a compatibility fallback because current NSE deployments can return 403 for the quote-equity route. The application records which source actually supplied the quote.

## 2. Annual-report discovery

The previous implementation treated any URL containing `annual-report` as a PDF candidate. That produced false positives such as page fragments and generic filing-page URLs.

1.10 only accepts:
- DOM links whose URL path ends in `.pdf`.
- Network responses whose content type is `application/pdf`.
- URLs embedded in JSON that resolve to a URL whose path ends in `.pdf`.

Generic page URLs, hash fragments and names containing the words "Annual Reports" are not treated as PDF files.

## 3. Shareholding discovery

The previous implementation accepted any API URL matching `sharehold`, which incorrectly retained unrelated `getNotes20` responses.

1.10 prioritizes `/api/corporate-share-holdings-master?index=equities&symbol=SYMBOL` and only retains payloads that both:
- come from a share-holdings endpoint, and
- contain shareholding evidence such as promoter/FII/DII/public holdings and shares/holding fields.

Generic metadata endpoints such as `getNotes20` are excluded.

## 4. Historical data

Historical rows are normalized to the equity series (`EQ`) by default so `series=ALL` cannot accidentally feed another security series into the technical-analysis evidence.

## 5. No LLM in acquisition

All acquisition, filtering, normalization and evidence writing remain deterministic. The LLM is used only by `npm run analyze -- SYMBOL` (or `npm run research -- SYMBOL --analyze` after acquisition).
