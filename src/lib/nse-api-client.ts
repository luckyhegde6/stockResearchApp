import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';
import { getBrowserSession, resetBrowserSession } from './browser.js';

const NSE_BASE = 'https://www.nseindia.com';
const UA = process.env.NSE_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = Number(process.env.NSE_API_TIMEOUT_MS || 30_000);
const MAX_RETRIES = Number(process.env.NSE_API_RETRIES || 2);
const RETRY_BASE_MS = Number(process.env.NSE_API_RETRY_BASE_MS || 1_000);

let jar: CookieJar | null = null;
let fetchWithCookies: any = null;
let sessionReady = false;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function initHttpClient() {
  if (fetchWithCookies) return;
  const mod = await import('node-fetch');
  jar = new CookieJar();
  fetchWithCookies = fetchCookie(mod.default as any, jar);
}

function browserHeaders(referer = `${NSE_BASE}/`) {
  return {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9,en-US;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'User-Agent': UA,
    'Referer': referer,
    'Origin': NSE_BASE,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

async function warmNseSession() {
  await initHttpClient();
  if (sessionReady) return;
  const warmUrls = [`${NSE_BASE}/`, `${NSE_BASE}/market-data/live-equity-market`];
  let gotResponse = false;
  for (const url of warmUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      const response = await fetchWithCookies(url, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9,en-US;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': `${NSE_BASE}/`,
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
      } as any);
      clearTimeout(timer);
      if (response.status < 500) gotResponse = true;
      if (response.ok) break;
    } catch {}
  }
  sessionReady = gotResponse || sessionReady;
}

async function httpFetchJson(url: string, referer: string) {
  await warmNseSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetchWithCookies(url, {
      method: 'GET',
      headers: browserHeaders(referer),
      signal: controller.signal,
    } as any);
    const text = await response.text();
    if (!response.ok) throw new Error(`NSE API ${response.status} ${response.statusText}: ${url}`);
    try { return JSON.parse(text); }
    catch { throw new Error(`NSE returned non-JSON response: ${url}: ${text.slice(0, 300)}`); }
  } finally {
    clearTimeout(timer);
  }
}

async function browserFetchJson(url: string, session: string, referer: string) {
  let state = await getBrowserSession(session, 'nse');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await state.page.evaluate(async ({ target, ref }) => {
        try {
          const r = await fetch(target, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-IN,en;q=0.9,en-US;q=0.8',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': ref,
            },
          });
          const text = await r.text();
          return { status: r.status, statusText: r.statusText, text };
        } catch (e: any) {
          return { status: 0, statusText: e?.message || String(e), text: '' };
        }
      }, { target: url, ref: referer });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`NSE browser API ${result.status} ${result.statusText}`);
      }
      try { return JSON.parse(result.text); }
      catch { throw new Error(`Browser NSE API returned non-JSON: ${url}: ${result.text.slice(0, 300)}`); }
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        state = await resetBrowserSession(session, 'nse');
        try {
          await state.page.goto(`${NSE_BASE}/market-data/live-equity-market`, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT });
        } catch {}
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Browser NSE API failed: ${url}`);
}

export interface NseApiContext { cwd: string; session: string; referer?: string; }

export async function nseFetchJson(pathOrUrl: string, ctx: NseApiContext) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${NSE_BASE}${pathOrUrl}`;
  const referer = ctx.referer || `${NSE_BASE}/`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpFetchJson(url, referer);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }

  try {
    return await browserFetchJson(url, ctx.session, referer);
  } catch (error) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${detail}; browser-context fallback failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const nseEndpoints = {
  quote: (ticker: string) => `/api/quote-equity?symbol=${encodeURIComponent(ticker)}`,
  tradeInfo: (ticker: string) => `/api/quote-equity?symbol=${encodeURIComponent(ticker)}&section=trade_info`,
  symbolName: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolName&symbol=${encodeURIComponent(ticker)}`,
  metadata: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getMetaData&symbol=${encodeURIComponent(ticker)}`,
  quoteNextApi: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(ticker)}`,
  yearwise: (identifier: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getYearwiseData&symbol=${encodeURIComponent(identifier)}`,
  symbolChart: (identifier: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolChartData&symbol=${encodeURIComponent(identifier)}&days=1D`,
  corporateAnnouncementSubjects: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorporateAnnouncementSubject&symbol=${encodeURIComponent(ticker)}&marketApiType=equities`,
  corporateAnnouncements: (ticker: string, fromDate: string, toDate: string, subject = '') => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorporateAnnouncement&symbol=${encodeURIComponent(ticker)}&marketApiType=equities&subject=${encodeURIComponent(subject)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
  boardMeetings: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpBoardMeeting&symbol=${encodeURIComponent(ticker)}&marketApiType=equities&type=W`,
  corporateActionsNextApi: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpAction&symbol=${encodeURIComponent(ticker)}&type=W&marketApiType=equities`,
  eventCalendar: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpEventCalender&symbol=${encodeURIComponent(ticker)}&marketApiType=equities`,
  annualReports: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpAnnualReport&symbol=${encodeURIComponent(ticker)}&marketApiType=equities`,
  brsr: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpBrsr&symbol=${encodeURIComponent(ticker)}`,
  shareholdingNextApi: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getShareholdingPattern&symbol=${encodeURIComponent(ticker)}&noOfRecords=5`,
  financialResultData: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getFinancialResultData&symbol=${encodeURIComponent(ticker)}&marketApiType=equities&noOfRecords=5`,
  financialStatus: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getFinancialStatus&symbol=${encodeURIComponent(ticker)}`,
  peerQuarters: (ticker: string) => `/api/NextApi/apiClient/GetQuoteApi?functionName=getPeerComparisonQuaters&symbol=${encodeURIComponent(ticker)}`,
  peerComparison: (ticker: string, quarter = '') => `/api/NextApi/apiClient/GetQuoteApi?functionName=getPeerComparisonData&symbol=${encodeURIComponent(ticker)}&type=S&quarter=${encodeURIComponent(quarter)}&param=industry&index=`,
  financialResults: (ticker: string) => `/api/results-comparision?index=equities&symbol=${encodeURIComponent(ticker)}`,
  announcements: (ticker: string) => `/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(ticker)}`,
  corporateActions: () => `/api/corporates-corporateActions?index=equities`,
  shareholding: (ticker: string) => `/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(ticker)}`,
  liveEquityMarket: () => `/market-data/live-equity-market`,
  indexList: () => `/api/NextApi/apiClient/marketWatchApi?functionName=getIndexList`,
  indexData: (indexName: string) => `/api/NextApi/apiClient/marketWatchApi?functionName=getIndicesData&symbol=${encodeURIComponent(indexName)}`,
  historical: (ticker: string, from: string, to: string) => `/api/historicalOR/generateSecurityWiseHistoricalData?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&symbol=${encodeURIComponent(ticker)}&type=priceVolumeDeliverable&series=ALL`,
  week52High: () => '/api/live-analysis-data-52weekhighstock',
};
