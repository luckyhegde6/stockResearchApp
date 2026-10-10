# Stock Research Pipeline v1.26

## NSE Market Universe

v1.26 adds market-wide NSE acquisition using the public live-equity-market page and NSE NextApi endpoints.

### Endpoints

```text
https://www.nseindia.com/market-data/live-equity-market
https://www.nseindia.com/api/NextApi/apiClient/marketWatchApi?functionName=getIndexList
https://www.nseindia.com/api/NextApi/apiClient/marketWatchApi?functionName=getIndicesData&symbol=<INDEX>
https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=<SYMBOL>
```

### Run

```cmd
npm run research:nse-market -- ITC
```

For a smoke test:

```cmd
set NSE_MARKET_MAX_SYMBOLS=20
npm run research:nse-market -- ITC
```

Normal operation:

```cmd
set NSE_MARKET_MAX_SYMBOLS=0
set NSE_MARKET_SYMBOL_DELAY_MS=250
set NSE_MARKET_RESUME=true
npm run research:nse-market -- ITC
```

### What it collects

- Equities and symbols from the live equity market page.
- Complete raw `getIndexList` response and normalized index list.
- `NIFTY 50` and `NIFTY 500` constituent/data responses explicitly.
- Every index returned by the index list, sequentially.
- Per-symbol equity quote data one symbol at a time.
- Raw and normalized JSON evidence.
- Per-run debug JSON, JSONL and timeline.
- Target ticker membership and quote summary when a ticker argument is supplied.

No LLM is used.
