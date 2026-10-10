import path from 'node:path';
import { writeText, ensureDir, fileExists } from '../lib/fs.js';
import { readFile } from 'node:fs/promises';
import { getBrowserSession, closeBrowserSession } from '../lib/browser.js';
import { nseFetchJson, nseEndpoints } from '../lib/nse-api-client.js';
import { DebugLogger } from '../lib/debug.js';
import { flattenNseIndexCatalog } from '../data/nse-index-catalog.js';
import { isPlausibleNseSymbol, transformIndexDataPayload, transformQuotePayload, normalizeIndexListPayload } from '../lib/nse-market-transformers.js';
import type { SourceArtifact } from '../types/research.js';

const NSE_BASE = 'https://www.nseindia.com';
const LIVE_PAGE = `${NSE_BASE}${nseEndpoints.liveEquityMarket()}`;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function text(v: unknown) { return String(v ?? '').trim(); }

function extractSymbolFromHref(href: string): string | null {
  try {
    const url = new URL(href, NSE_BASE);
    const match = url.pathname.match(/\/get-quote\/equity\/([^/]+)/i);
    if (!match) return null;
    const symbol = decodeURIComponent(match[1]).trim().toUpperCase();
    return isPlausibleNseSymbol(symbol) ? symbol : null;
  } catch { return null; }
}

function extractSymbolsFromPage(links: Array<{text: string; href: string}>, rows: Array<string[]>, attrs: string[]) {
  const symbols = new Set<string>();
  // Only actual NSE quote URLs are trusted from arbitrary links.
  for (const link of links) {
    const symbol = extractSymbolFromHref(link.href);
    if (symbol) symbols.add(symbol);
  }
  // For tables, require a Symbol-like header before accepting the symbol column.
  let symbolColumn = -1;
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map(text).map(v => v.toUpperCase());
    const idx = header.findIndex(v => v === 'SYMBOL' || v === 'SYMBOLS' || v.includes('TRADING SYMBOL'));
    if (idx >= 0) { symbolColumn = idx; break; }
  }
  if (symbolColumn >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const c = text(rows[i][symbolColumn]).toUpperCase();
      if (isPlausibleNseSymbol(c)) symbols.add(c);
    }
  }
  for (const attr of attrs) {
    const c = text(attr).toUpperCase();
    if (isPlausibleNseSymbol(c)) symbols.add(c);
  }
  return [...symbols].sort();
}

export async function captureLiveMarketPage(session: string, debug: DebugLogger, rawRoot: string) {
  const started = Date.now();
  const state = await getBrowserSession(session, 'nse');
  await debug.emit('NSE/MARKET/LIVE_PAGE', 'START', 'Opening NSE live equity market page', { url: LIVE_PAGE });
  await state.page.goto(LIVE_PAGE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await state.page.waitForTimeout(5_000);

  const payload = await state.page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map(a => ({
      text: (a.innerText || a.textContent || '').trim(),
      href: a.href,
    }));
    const rows = [...document.querySelectorAll('table tr')].map(tr => [...tr.querySelectorAll('th,td')].map(td => (td.textContent || '').trim()));
    return {
      url: location.href,
      title: document.title,
      links,
      rows,
      bodyText: document.body?.innerText || '',
      symbolAttributes: [...document.querySelectorAll<HTMLElement>('[data-symbol],[data-identifier],[data-scrip],[data-tradingsymbol]')].flatMap(el => [
        el.getAttribute('data-symbol') || '',
        el.getAttribute('data-identifier') || '',
        el.getAttribute('data-scrip') || '',
        el.getAttribute('data-tradingsymbol') || '',
      ]).filter(Boolean),
      html: document.documentElement.outerHTML,
    };
  });

  const symbols = extractSymbolsFromPage(payload.links, payload.rows, payload.symbolAttributes);
  const out = {
    capturedAt: new Date().toISOString(),
    requestedUrl: LIVE_PAGE,
    finalUrl: payload.url,
    title: payload.title,
    symbolCount: symbols.length,
    symbols,
    linkCount: payload.links.length,
    tableRowCount: payload.rows.length,
    bodyTextLength: payload.bodyText.length,
    htmlLength: payload.html.length,
  };

  await writeText(path.join(rawRoot, 'live-equity-market-page.json'), JSON.stringify(payload, null, 2));
  await writeText(path.join(rawRoot, 'live-equity-symbols.json'), JSON.stringify(out, null, 2));
  await state.page.screenshot({ path: path.join(rawRoot, 'live-equity-market.png'), fullPage: true });

  await debug.emit('NSE/MARKET/LIVE_PAGE', symbols.length ? 'OK' : 'WARN', 'Live equity market page scraped', {
    finalUrl: payload.url,
    symbolCount: symbols.length,
    linkCount: payload.links.length,
    tableRows: payload.rows.length,
    durationMs: Date.now() - started,
  });

  return { symbols, payload, out };
}

export async function runNseMarketUniverse(options: { ticker?: string; root: string }): Promise<{
  artifacts: SourceArtifact[]; gaps: string[]; warnings: string[]; summary: any;
}> {
  const { root, ticker } = options;
  const rawRoot = path.join(root, 'live-equity-market');
  const indexRoot = path.join(root, 'indices');
  const equityRoot = path.join(root, 'equities');
  const debugRoot = path.join(root, 'debug');
  await Promise.all([ensureDir(rawRoot), ensureDir(indexRoot), ensureDir(equityRoot), ensureDir(debugRoot)]);

  const session = `stock-research-nse-market-${Date.now()}`;
  const debug = new DebugLogger(debugRoot, process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ ticker: ticker ?? null, adapter: 'NSEMarketUniverse', node: process.version, cwd: process.cwd(), root });

  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const t0 = Date.now();

  try {
    const live = await captureLiveMarketPage(session, debug, rawRoot);
    const symbols = live.symbols;

    const indexListT0 = Date.now();
    const indexResults: Record<string, any> = {};
    const catalogEntries = flattenNseIndexCatalog();
    await writeText(path.join(indexRoot, 'index-catalog.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'user-supplied NSE index catalog',
      count: catalogEntries.length,
      categories: catalogEntries.reduce((acc, entry) => {
        (acc[entry.category] ||= []).push(entry);
        return acc;
      }, {} as Record<string, typeof catalogEntries>),
      entries: catalogEntries,
    }, null, 2));
    await debug.emit('NSE/MARKET/INDEX_LIST', 'START', 'Fetching NSE index list', { endpoint: `${NSE_BASE}${nseEndpoints.indexList()}`, catalogCount: catalogEntries.length });

    let apiIndexEntries: any[] = [];
    let indexListPayload: any = null;
    try {
      indexListPayload = await nseFetchJson(nseEndpoints.indexList(), { cwd: process.cwd(), session, referer: LIVE_PAGE });
      const indexListPath = path.join(indexRoot, 'index-list.json');
      await writeText(indexListPath, JSON.stringify(indexListPayload, null, 2));
      const normalizedApi = normalizeIndexListPayload(indexListPayload);
      apiIndexEntries = normalizedApi.entries;
      const apiByName = new Map(apiIndexEntries.map((e: any) => [e.displayName.toUpperCase(), e]));
      const merged = catalogEntries.map(e => ({ ...e, apiMatched: apiByName.has(e.displayName.toUpperCase()), apiEntry: apiByName.get(e.displayName.toUpperCase()) ?? null }));
      const extras = apiIndexEntries.filter(e => !catalogEntries.some(c => c.displayName.toUpperCase() === e.displayName.toUpperCase()));
      await writeText(path.join(indexRoot, 'index-list-normalized.json'), JSON.stringify({
        count: merged.length, apiCount: apiIndexEntries.length, catalogCount: catalogEntries.length,
        categories: normalizedApi.categories, indices: merged, apiExtras: extras,
      }, null, 2));
      await debug.emit('NSE/MARKET/INDEX_LIST', apiIndexEntries.length ? 'OK' : 'OK_WITH_FALLBACK', 'NSE index list acquired and normalized', { apiCount: apiIndexEntries.length, catalogCount: catalogEntries.length, durationMs: Date.now() - indexListT0 });
      artifacts.push({ id: 'nse-market-index-list', type: 'market_data', provider: 'NSE India API', title: 'NSE index list', url: `${NSE_BASE}${nseEndpoints.indexList()}`, localPath: indexListPath, retrievedAt: new Date().toISOString(), status: apiIndexEntries.length ? 'ok' : 'partial', method: 'script', notes: [`apiIndices=${apiIndexEntries.length}`, `catalogIndices=${catalogEntries.length}`] });
    } catch (e: any) {
      const msg = e?.message || String(e);
      warnings.push(`NSE index list API: ${msg}; using supplied complete index catalog.`);
      await writeText(path.join(indexRoot, 'index-list-normalized.json'), JSON.stringify({ count: catalogEntries.length, apiCount: 0, catalogCount: catalogEntries.length, apiUnavailable: true, indices: catalogEntries }, null, 2));
      await debug.emit('NSE/MARKET/INDEX_LIST', 'OK_WITH_FALLBACK', 'NSE index list API unavailable; supplied catalog used', { error: msg, catalogCount: catalogEntries.length, durationMs: Date.now() - indexListT0 });
    }

    const indexEntriesToFetch = catalogEntries;
    const failedIndices: string[] = [];
    for (let i = 0; i < indexEntriesToFetch.length; i++) {
      const index = indexEntriesToFetch[i];
      const indexName = index.displayName;
      const slug = slugify(indexName);
      const started = Date.now();
      const endpoint = nseEndpoints.indexData(index.apiSymbol);
      const checkpoint = `NSE/MARKET/INDEX_${String(i + 1).padStart(3, '0')}`;
      await debug.emit(checkpoint, 'START', 'Fetching index constituent data', { index: indexName, apiSymbol: index.apiSymbol, category: index.category, sequence: i + 1, total: indexEntriesToFetch.length, endpoint: `${NSE_BASE}${endpoint}` });
      try {
        const payload = await nseFetchJson(endpoint, { cwd: process.cwd(), session, referer: LIVE_PAGE });
        const rawPath = path.join(indexRoot, `${slug}.json`);
        const normalizedPath = path.join(indexRoot, `${slug}.normalized.json`);
        const normalized = transformIndexDataPayload(index, payload);
        await writeText(rawPath, JSON.stringify(payload, null, 2));
        await writeText(normalizedPath, JSON.stringify(normalized, null, 2));
        indexResults[indexName] = normalized;
        const status = normalized.equityRowCount > 0 ? 'OK' : 'WARN';
        await debug.emit(checkpoint, status, 'Index data acquired', { index: indexName, apiSymbol: index.apiSymbol, rows: normalized.rowCount, equityRows: normalized.equityRowCount, symbols: normalized.symbols.length, durationMs: Date.now() - started });
        artifacts.push({ id: `nse-market-index-${slug}`, type: 'market_data', provider: 'NSE India API', title: `NSE index data — ${indexName}`, url: `${NSE_BASE}${endpoint}`, localPath: rawPath, retrievedAt: new Date().toISOString(), status: normalized.equityRowCount ? 'ok' : 'partial', method: 'script', notes: [`category=${index.category}`, `apiSymbol=${index.apiSymbol}`, `symbols=${normalized.symbols.length}`, `rows=${normalized.rowCount}`] });
        artifacts.push({ id: `nse-market-index-${slug}-normalized`, type: 'derived_data', provider: 'script', title: `Normalized NSE index data — ${indexName}`, url: `${NSE_BASE}${endpoint}`, localPath: normalizedPath, retrievedAt: new Date().toISOString(), status: normalized.equityRowCount ? 'ok' : 'partial', method: 'script', notes: ['DTO/transformer normalized. Raw response preserved separately.'] });
      } catch (e: any) {
        const msg = e?.message || String(e);
        failedIndices.push(indexName);
        warnings.push(`NSE index ${indexName}: ${msg}`);
        await debug.emit(checkpoint, 'WARN', 'Index data fetch failed', { index: indexName, apiSymbol: index.apiSymbol, error: msg, durationMs: Date.now() - started });
      }
      const indexDelay = Math.max(0, Number(process.env.NSE_MARKET_INDEX_DELAY_MS || 150));
      if (indexDelay && i < indexEntriesToFetch.length - 1) await sleep(indexDelay);
    }

    const symbolLists = Object.fromEntries(Object.entries(indexResults).map(([name, data]) => [name, data.symbols]));
    await writeText(path.join(indexRoot, 'all-index-symbol-lists.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: Object.keys(symbolLists).length, indices: symbolLists }, null, 2));
    for (const key of ['NIFTY 50', 'NIFTY 500']) {
      if (indexResults[key]) await writeText(path.join(indexRoot, `${slugify(key)}-symbols.json`), JSON.stringify(indexResults[key].symbols, null, 2));
    }
    await writeText(path.join(indexRoot, 'index-fetch-summary.json'), JSON.stringify({ requested: indexEntriesToFetch, succeeded: Object.keys(indexResults), failed: failedIndices }, null, 2));
    if (failedIndices.length) gaps.push(...failedIndices.map(n => `NSE index data unavailable: ${n}`));

    // Build the quote universe from the actual live-market page first. When NIFTY 500
    // data was successfully acquired, union its constituents as a coverage backstop.
    const indexedSymbols = Object.values(indexResults).flatMap((v: any) => Array.isArray(v?.symbols) ? v.symbols : []);
    const targetSymbol = ticker?.toUpperCase() || '';
    const cleanLiveSymbols = symbols.filter(isPlausibleNseSymbol);
    // Target is deliberately first so a smoke test never misses the requested company.
    const allSymbols = [...new Set([...(targetSymbol ? [targetSymbol] : []), ...indexedSymbols.map((s: string) => s.toUpperCase()), ...cleanLiveSymbols.map((s: string) => s.toUpperCase())])];
    const maxSymbolsRaw = Number(process.env.NSE_MARKET_MAX_SYMBOLS || 0);
    const maxSymbols = maxSymbolsRaw > 0 ? Math.min(maxSymbolsRaw, allSymbols.length) : allSymbols.length;
    const resume = process.env.NSE_MARKET_RESUME !== 'false';
    const delayMs = Math.max(0, Number(process.env.NSE_MARKET_SYMBOL_DELAY_MS || 250));
    const selectedSymbols = allSymbols.slice(0, maxSymbols);
    const symbolResults: any[] = [];
    let successes = 0;
    let failures = 0;

    await debug.emit('NSE/MARKET/EQUITY_QUOTES', 'START', 'Fetching equity quotes one-by-one', { livePageSymbols: cleanLiveSymbols.length, quoteUniverseSymbols: allSymbols.length, selected: selectedSymbols.length, delayMs, resume });
    for (let i = 0; i < selectedSymbols.length; i++) {
      const symbol = selectedSymbols[i];
      const slug = slugify(symbol);
      const rawPath = path.join(equityRoot, `${slug}.json`);
      const normalizedPath = path.join(equityRoot, `${slug}.normalized.json`);
      const started = Date.now();
      await debug.emit(`NSE/MARKET/EQUITY_${String(i + 1).padStart(4, '0')}`, 'START', 'Fetching equity quote', { symbol, sequence: i + 1, total: selectedSymbols.length, endpoint: `${NSE_BASE}${nseEndpoints.quoteNextApi(symbol)}` });

      try {
        if (resume && await fileExists(rawPath) && await fileExists(normalizedPath)) {
          const existing = JSON.parse(await readFile(normalizedPath, 'utf8'));
          symbolResults.push({ symbol, status: 'resumed', normalized: existing });
          successes++;
          await debug.emit(`NSE/MARKET/EQUITY_${String(i + 1).padStart(4, '0')}`, 'SKIP', 'Equity quote already acquired; resumed existing artifact', { symbol, path: rawPath });
          continue;
        }
        const endpoint = nseEndpoints.quoteNextApi(symbol);
        const payload = await nseFetchJson(endpoint, { cwd: process.cwd(), session, referer: LIVE_PAGE });
        const normalized = transformQuotePayload(symbol, payload, `${NSE_BASE}${endpoint}`);
        await writeText(rawPath, JSON.stringify(payload, null, 2));
        await writeText(normalizedPath, JSON.stringify(normalized, null, 2));
        const usable = normalized.lastPrice != null && normalized.symbol?.toUpperCase() === symbol.toUpperCase();
        symbolResults.push({ symbol, status: usable ? 'ok' : 'partial', normalized });
        if (usable) successes++; else failures++;
        await debug.emit(`NSE/MARKET/EQUITY_${String(i + 1).padStart(4, '0')}`, usable ? 'OK' : 'WARN', usable ? 'Equity quote acquired' : 'Equity quote payload acquired but normalized quote is incomplete', { symbol, resolvedSymbol: normalized.symbol, lastPrice: normalized.lastPrice, pChange: normalized.pChange, durationMs: Date.now() - started });
      } catch (e: any) {
        const msg = e?.message || String(e);
        failures++;
        symbolResults.push({ symbol, status: 'error', error: msg });
        warnings.push(`NSE equity ${symbol}: ${msg}`);
        await debug.emit(`NSE/MARKET/EQUITY_${String(i + 1).padStart(4, '0')}`, 'WARN', 'Equity quote failed', { symbol, error: msg, durationMs: Date.now() - started });
      }
      if (delayMs && i < selectedSymbols.length - 1) await sleep(delayMs);
    }

    await writeText(path.join(equityRoot, 'equity-quotes-normalized.json'), JSON.stringify({ generatedAt: new Date().toISOString(), source: 'NSE NextApi getSymbolData', discoveredSymbols: cleanLiveSymbols.length, selectedSymbols: selectedSymbols.length, successes, failures, items: symbolResults }, null, 2));
    await writeText(path.join(equityRoot, 'equity-fetch-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), discoveredSymbols: cleanLiveSymbols, selectedSymbols, successes, failures, resume, delayMs }, null, 2));

    artifacts.push({ id: 'nse-market-live-equity-page', type: 'source_page', provider: 'NSE India', title: 'NSE Live Equity Market page', url: LIVE_PAGE, localPath: path.join(rawRoot, 'live-equity-market-page.json'), screenshotPath: path.join(rawRoot, 'live-equity-market.png'), retrievedAt: new Date().toISOString(), status: cleanLiveSymbols.length ? 'ok' : 'partial', method: 'playwright', notes: [`symbols=${cleanLiveSymbols.length}`] });
    artifacts.push({ id: 'nse-market-live-equity-symbols', type: 'derived_data', provider: 'script', title: 'NSE live equity market symbol universe', url: LIVE_PAGE, localPath: path.join(rawRoot, 'live-equity-symbols.json'), retrievedAt: new Date().toISOString(), status: cleanLiveSymbols.length ? 'ok' : 'partial', method: 'script', notes: ['Equities discovered from the public live-equity-market page.'] });
    artifacts.push({ id: 'nse-market-equity-quotes', type: 'market_data', provider: 'NSE India API', title: 'NSE one-by-one equity quote collection', url: `${NSE_BASE}${nseEndpoints.quoteNextApi('<SYMBOL>')}`, localPath: path.join(equityRoot, 'equity-quotes-normalized.json'), retrievedAt: new Date().toISOString(), status: failures ? (successes ? 'partial' : 'error') : 'ok', method: 'script', notes: [`livePageSymbols=${cleanLiveSymbols.length}`, `quoteUniverse=${allSymbols.length}`, `selected=${selectedSymbols.length}`, `successes=${successes}`, `failures=${failures}`] });

    if (!cleanLiveSymbols.length) warnings.push('NSE live equity market page yielded no direct equity links/table symbols; NIFTY index constituents may still provide the quote universe.');
    if (selectedSymbols.length < allSymbols.length && process.env.NSE_MARKET_MAX_SYMBOLS) warnings.push(`NSE market universe limited to ${selectedSymbols.length} of ${allSymbols.length} symbols by NSE_MARKET_MAX_SYMBOLS.`);

    let tickerMembership: any = null;
    if (ticker) {
      const target = ticker.toUpperCase();
      const indexMembership: string[] = [];
      for (const [name, value] of Object.entries(indexResults ?? {})) {
        const symbolsForIndex = (value as any)?.symbols || [];
        if (symbolsForIndex.includes(target)) indexMembership.push(name);
      }
      const quote = symbolResults.find(r => r.symbol === target)?.normalized ?? null;
      tickerMembership = { ticker: target, discoveredInLiveEquityPage: cleanLiveSymbols.includes(target), indexMembership, quote: quote ? { symbol: quote.symbol, companyName: quote.companyName, lastPrice: quote.lastPrice, pChange: quote.pChange, previousClose: quote.previousClose, open: quote.open, dayHigh: quote.dayHigh, dayLow: quote.dayLow, yearHigh: quote.yearHigh, yearLow: quote.yearLow, totalTradedVolume: quote.totalTradedVolume, lastUpdateTime: quote.lastUpdateTime } : null };
      const targetDir = path.join(process.cwd(), 'research', target, 'raw', 'nse-market');
      await ensureDir(targetDir);
      const targetPath = path.join(targetDir, 'membership.json');
      await writeText(targetPath, JSON.stringify(tickerMembership, null, 2));
      artifacts.push({ id: 'nse-market-target-membership', type: 'derived_data', provider: 'NSE India', title: `NSE market membership for ${target}`, url: LIVE_PAGE, localPath: targetPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: [`indices=${indexMembership.length}`] });
    }

    const summary = {
      schema_version: '1.1',
      source: 'NSE India',
      generatedAt: new Date().toISOString(),
      root,
      liveEquityMarket: { url: LIVE_PAGE, discoveredSymbols: cleanLiveSymbols.length, quoteUniverseSymbols: allSymbols.length },
      indexList: { endpoint: `${NSE_BASE}${nseEndpoints.indexList()}` },
      equityQuotes: { oneByOne: true, selectedSymbols: selectedSymbols.length, successes, failures },
      artifacts: artifacts.length,
      dataGaps: gaps.length,
      warnings: warnings.length,
      tickerMembership,
      durationMs: Date.now() - t0,
    };
    await writeText(path.join(root, 'index.json'), JSON.stringify(summary, null, 2));
    await debug.emit('NSE/MARKET/VALIDATION', gaps.length ? 'WARN' : (warnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'NSE market universe acquisition complete', { discoveredSymbols: cleanLiveSymbols.length, quoteSuccesses: successes, quoteFailures: failures, artifacts: artifacts.length, dataGaps: gaps.length, warnings: warnings.length }, Date.now() - t0);
    await debug.finish(summary);
    return { artifacts, gaps: [...new Set(gaps)], warnings: [...new Set(warnings)], summary };
  } finally {
    await closeBrowserSession(session).catch(() => {});
  }
}
