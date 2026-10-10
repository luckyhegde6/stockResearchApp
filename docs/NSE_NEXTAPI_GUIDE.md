# NSE NextAPI Guide & Catalog

This document details the **NSE NextAPI Client** implementation (`src/lib/nse-api-client.ts`, `src/lib/nse-nextapi.ts`, and `src/lib/nse-securities.ts`), providing session management, cookie acquisition, historical OHLCV chunking, rate limiting, and security master resolution rules.

---

## 🔑 Session & Cookie Acquisition Mechanism

NSE's NextAPI (`nsearchives.nseindia.com` and `www.nseindia.com`) requires session cookies (`nsit`, `nseappid`, `bm_sv`) and browser headers to prevent anti-bot blocking (HTTP 403 / 401).

### Cookie Flow
1. **Initial Handshake**:
   - The API client performs a GET request to `https://www.nseindia.com` using `fetch-cookie` and `tough-cookie` with standard browser headers (`User-Agent`, `Accept-Language`, `Referer`).
2. **Cookie Retention**:
   - Cookies are saved in memory and reused across subsequent NextAPI endpoint requests.
3. **Session Refresh & Retry**:
   - If an endpoint returns HTTP 401/403, the client clears cookies, waits 1500ms, re-acquires a fresh session from the homepage, and retries the call.

---

## 🌐 NextAPI Endpoint Catalog

| Endpoint Name | Path / URL Pattern | Method | Purpose |
| :--- | :--- | :--- | :--- |
| **Quote Details** | `/api/quote-equity?symbol=<SYMBOL>` | GET | Stock quote, 52W high/low, last price, market cap. |
| **Trade Info** | `/api/quote-equity?symbol=<SYMBOL>&section=trade_info` | GET | Order book, turnover, delivery percentage. |
| **Historical Data** | `/api/historical/cm/equity?symbol=<SYMBOL>&series=["EQ"]&from=<DD-MM-YYYY>&to=<DD-MM-YYYY>` | GET | Historical OHLCV, series, delivery data. |
| **Shareholding** | `/api/shareholding-pattern?symbol=<SYMBOL>` | GET | Promoter, DII, FII, and public holding percentages. |
| **Announcements** | `/api/corporate-announcements?symbol=<SYMBOL>` | GET | Recent regulatory disclosure filings and PDFs. |
| **Security Master** | `https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv` | GET | Official master list of all listed NSE equity symbols. |

---

## 📅 Historical OHLCV Data Chunking

NSE restricts historical API queries to a **maximum of 365 days per request**. Querying multi-year data requires date chunking (`src/lib/data-quality.ts`):

```typescript
// Date Chunking Strategy:
// To fetch 5 years of historical OHLCV data for RELIANCE:
// Chunk 1: 2021-09-22 to 2022-09-21
// Chunk 2: 2022-09-22 to 2023-09-21
// Chunk 3: 2023-09-22 to 2024-09-21
// Chunk 4: 2024-09-22 to 2025-09-21
// Chunk 5: 2025-09-22 to 2026-09-22
```

### De-duplication & Quality Checks
When chunks are merged:
- Records are de-duplicated on `symbol + series + timestamp`.
- Invalid OHLCV values (e.g. `High < Low`, missing Close) are flagged and reported in `HistoricalQualityReport`.

---

## 🏛️ Security Master Resolution (`EQUITY_L`)

The pipeline maintains a cached local copy of the official NSE Equity Securities Master at `data/nse-equity-universe.json`.

### Resolution Rules (`src/lib/nse-securities.ts`)
1. **Input Normalization**: Strips spaces, converts to uppercase, removes exchange prefixes (`NSE:`, `.NS`).
2. **Exact Symbol Match**: Checks if the symbol exists in `EQUITY_L`.
3. **Series Check**: Verifies that the security belongs to the **`EQ` series** (`preferredForStockResearch = true`).
4. **Fuzzy Search & Suggestions**: If an invalid symbol is entered (e.g. `RELIAN`), the resolver suggests valid matching equity symbols (`RELIANCE`).

---

## 🚦 Rate Limiting & Backoff Guidelines

- **Max Requests per Second**: 3 requests / second.
- **Delay Between Retries**: Exponential backoff (1s, 2s, 4s).
- **User-Agent Rotation**: Uses realistic Chrome Desktop User-Agent strings.
