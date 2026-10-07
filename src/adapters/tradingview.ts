import path from 'node:path';
import { stat } from 'node:fs/promises';
import { browserRunCode, closeBrowserSession } from '../lib/browser.js';
import { ensureDir, writeText, fileExists } from '../lib/fs.js';
import { buildTradingViewInstrument, buildTradingViewSurfaceUrl, type TradingViewUiSurface } from '../lib/tradingview-url.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

async function firstVisible(page: any, locators: any[]) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function safeScreenshot(page: any, screenshotPath: string, options: { fullPage?: boolean } = {}) {
  await page.screenshot({ path: screenshotPath, fullPage: options.fullPage ?? false });
  const s = await stat(screenshotPath).catch(() => null);
  return { exists: Boolean(s?.isFile()), bytes: s?.size ?? 0 };
}

async function dumpState(page: any) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('button,[role=button],[role=menuitem],[role=option],[aria-label],[title],[data-name]')].slice(0, 500);
    const controls = els.map((e: any) => ({
      tag: e.tagName,
      role: e.getAttribute('role'),
      text: (e.innerText || e.textContent || '').trim().slice(0, 160),
      aria: e.getAttribute('aria-label'),
      title: e.getAttribute('title'),
      dataName: e.getAttribute('data-name'),
      dataValue: e.getAttribute('data-value'),
      className: String(e.className || '').slice(0, 160),
    })).filter((x: any) => x.text || x.aria || x.title || x.dataName);
    return {
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText || '').slice(0, 12000),
      width: innerWidth,
      height: innerHeight,
      controls,
    };
  });
}

async function dismiss(page: any) {
  const patterns = [/Accept/i, /I agree/i, /Got it/i, /Dismiss/i, /^Close$/i];
  for (const re of patterns) {
    const loc = page.getByRole('button', { name: re });
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 4); i++) await loc.nth(i).click({ timeout: 1500 }).catch(() => {});
  }
}

async function clickExactVisible(page: any, labels: RegExp[], timeout = 7000) {
  const locators: any[] = [];
  for (const re of labels) {
    locators.push(
      page.getByRole('button', { name: re }),
      page.getByRole('menuitem', { name: re }),
      page.getByRole('option', { name: re }),
      page.getByRole('tab', { name: re }),
      page.locator('[aria-label]').filter({ hasText: re }),
      page.locator('[title]').filter({ hasText: re }),
      page.getByText(re),
    );
  }
  const item = await firstVisible(page, locators);
  if (!item) return { found: false, clicked: false, matchedText: null as string | null };
  const matchedText = await item.innerText().catch(() => null);
  const clicked = await item.click({ timeout }).then(() => true).catch(() => false);
  return { found: true, clicked, matchedText };
}

async function selectCandles(page: any) {
  const control = await firstVisible(page, [
    page.getByRole('button', { name: /chart type/i }),
    page.locator('[aria-label*="Chart type" i]'),
    page.locator('[title*="Chart type" i]'),
    page.locator('[data-name*="chartType" i]'),
    page.locator('[data-name*="chart-type" i]'),
  ]);
  if (!control) return { attempted: false, selected: false, controlFound: false };
  const controlText = await control.innerText().catch(() => null);
  await control.click({ timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(500);
  const candle = await firstVisible(page, [
    page.getByRole('menuitem', { name: /^Candles$/i }),
    page.getByRole('option', { name: /^Candles$/i }),
    page.getByText(/^Candles$/i, { exact: true }),
    page.getByText(/^Candlestick$/i, { exact: true }),
    page.locator('[data-value="candles" i]'),
    page.locator('[data-name*="candles" i]'),
  ]);
  if (!candle) return { attempted: true, selected: false, controlFound: true, controlText };
  const selected = await candle.click({ timeout: 7000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(800);
  return { attempted: true, selected, controlFound: true, controlText };
}

async function selectRange(page: any, label: '5Y' | 'All') {
  const direct = await clickExactVisible(page, label === '5Y'
    ? [/^5Y$/i, /^5 years$/i, /5 years/i]
    : [/^All$/i, /^All data$/i, /^All time$/i, /All data/i], 8000);
  if (direct.clicked) {
    await page.waitForTimeout(Number(process.env.TRADINGVIEW_RANGE_SETTLE_MS || 3000));
    return { attempted: true, clicked: true, matchedText: direct.matchedText, menuOpened: false };
  }

  // Current Supercharts can place range controls behind a date-range menu.
  const rangeMenu = await firstVisible(page, [
    page.getByRole('button', { name: /date range|range/i }),
    page.locator('[aria-label*="date range" i]'),
    page.locator('[title*="date range" i]'),
    page.locator('[data-name*="date-range" i]'),
    page.locator('[data-name*="dateRange" i]'),
    page.locator('[data-name*="go-to" i]'),
  ]);
  if (rangeMenu) {
    await rangeMenu.click({ timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(500);
    const nested = await clickExactVisible(page, label === '5Y'
      ? [/^5Y$/i, /^5 years$/i, /5 years/i]
      : [/^All$/i, /^All data$/i, /^All time$/i, /All data/i], 8000);
    if (nested.clicked) {
      await page.waitForTimeout(Number(process.env.TRADINGVIEW_RANGE_SETTLE_MS || 3000));
      return { attempted: true, clicked: true, matchedText: nested.matchedText, menuOpened: true };
    }
  }
  await page.waitForTimeout(1000);
  return { attempted: true, clicked: false, matchedText: direct.matchedText, menuOpened: Boolean(rangeMenu) };
}

async function captureRange(page: any, range: '5Y' | 'All', screenshotPath: string, instrument: any, rawDir: string) {
  await dismiss(page);
  const before = await dumpState(page);
  await writeText(path.join(rawDir, `debug-${range.toLowerCase()}-before.json`), JSON.stringify(before, null, 2));
  const chartType = await selectCandles(page);
  await writeText(path.join(rawDir, `debug-${range.toLowerCase()}-after-candles.json`), JSON.stringify(await dumpState(page), null, 2));
  const rangeSelection = await selectRange(page, range);
  const state = await dumpState(page);
  await writeText(path.join(rawDir, `debug-${range.toLowerCase()}-after-range.json`), JSON.stringify(state, null, 2));
  const screenshot = await safeScreenshot(page, screenshotPath);
  const capturedAt = new Date().toISOString();
  const out = {
    schema_version: '1.2', provider: 'TradingView', instrument,
    requestedRange: range, capturedAt,
    chartUrl: instrument.chartUrl, finalUrl: state.url,
    fullChart: true, chartType, rangeSelection,
    screenshotPath, screenshot,
    viewport: { width: state.width, height: state.height },
    bodyTextSample: state.bodyText,
    notes: [
      'Dynamic TradingView instrument URL generated from the requested symbol.',
      'Screenshot is retained as visual evidence.',
      'Numeric indicators are never inferred from chart pixels.',
      rangeSelection.clicked ? `Requested ${range} range control was clicked.` : `Requested ${range} range control was not confirmed; screenshot is retained but marked partial.`,
    ],
  };
  await writeText(path.join(rawDir, `fullchart-${range.toLowerCase()}.json`), JSON.stringify(out, null, 2));
  return out;
}


const UI_SURFACE_LABELS: Record<TradingViewUiSurface,string> = {
  forecast: 'Forecast',
  news: 'News',
  documents: 'Documents',
  seasonals: 'Seasonals',
  community: 'Community',
  financials: 'Financials',
  options: 'Options',
  etfs: 'ETFs',
  bonds: 'Bonds',
};

function configuredUiSurfaces(): TradingViewUiSurface[] {
  const raw = String(process.env.TRADINGVIEW_UI_SURFACES || 'forecast,news,documents,seasonals,community')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  const valid = new Set<TradingViewUiSurface>(Object.keys(UI_SURFACE_LABELS) as TradingViewUiSurface[]);
  return raw.filter((x): x is TradingViewUiSurface => valid.has(x as TradingViewUiSurface));
}

async function waitForUiSurfaceConfirmation(page:any, surface:TradingViewUiSurface, beforeUrl:string, targetUrl:string) {
  const deadline=Date.now()+Number(process.env.TRADINGVIEW_UI_CONFIRM_TIMEOUT_MS || 10000);
  const patterns:Record<string,RegExp>={
    forecast:/Price target|Analyst rating|Actuals and estimates|Analysts offering 1-year price forecasts/i,
    news:/Why .*share price|Latest news|Earnings|Dividends|Share buybacks|Mergers and acquisitions|Insider trading|Analysts/i,
    documents:/Documents|Earnings, Q\d|Corporate events|Interim report|Annual report/i,
    seasonals:/Historical seasonal performance|Seasonals|Seasonality|Average\\s+(Percent|Return)/i,
    community:/Community|Ideas|Published|Popular ideas|Related ideas/i,
    financials:/Fundamentals and stats|Income statement|Balance sheet|Cash flow|EPS and revenue snapshot/i,
    options:/Options|Calls|Puts|Expiration/i,
    etfs:/ETFs|ETF/i,
    bonds:/Bonds|Bond/i,
  };
  let last:any={url:beforeUrl,bodyText:''};
  while(Date.now()<deadline){
    last=await dumpState(page).catch(()=>({url:beforeUrl,bodyText:''}));
    const body=String(last.bodyText||'');
    const url=String(last.url||'');
    const contentMatches = Boolean(patterns[surface]?.test(body));
    let routeMatches = false;
    try {
      const current = new URL(url);
      const expected = new URL(targetUrl);
      const normalizePath = (value:string) => value.replace(/\\/+$/, '/') || '/';
      routeMatches =
        current.hostname === expected.hostname &&
        normalizePath(current.pathname) === normalizePath(expected.pathname);
    } catch {}

    if (routeMatches && contentMatches) {
      return {
        confirmed:true,
        routeChanged:url!==beforeUrl,
        routeMatched:true,
        surfaceContent:true,
        url,
        bodyTextSample:body.slice(0,12000),
      };
    }
    await page.waitForTimeout(400);
  }
  return {
    confirmed:false,
    routeChanged:String(last.url||'')!==beforeUrl,
    routeMatched:false,
    surfaceContent:false,
    url:String(last.url||beforeUrl),
    bodyTextSample:String(last.bodyText||'').slice(0,12000),
  };
}

async function captureUiSurface(
  page:any,
  surface:TradingViewUiSurface,
  screenshotPath:string,
  rawDir:string,
  instrument:any,
) {
  // v1.49.5: Use TradingView's stable public symbol pages directly with
  // Playwright. Do not depend on the changing Metrics launcher DOM.
  // Example:
  //   https://in.tradingview.com/symbols/NSE-ITC/news/
  //   https://in.tradingview.com/symbols/NSE-ITC/documents/
  //   https://in.tradingview.com/symbols/NSE-ITC/seasonals/
  //   https://in.tradingview.com/symbols/NSE-ITC/forecast-price-target/
  const before = await dumpState(page).catch(()=>({url:instrument.chartUrl,title:'',width:0,height:0,bodyText:''}));
  const targetUrl = buildTradingViewSurfaceUrl(instrument.symbol, instrument.exchange, surface);
  const timeout = Number(process.env.TRADINGVIEW_DIRECT_SURFACE_TIMEOUT_MS || process.env.SOURCE_TIMEOUT_MS || 120000);
  const settle = Number(process.env.TRADINGVIEW_DIRECT_SURFACE_SETTLE_MS || 5000);

  const navigation:any = {
    method:'playwright-direct-public-symbol-page',
    targetUrl,
    attempted:true,
    loaded:false,
    finalUrl:null,
    error:null,
  };

  try {
    await page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout});
    await page.waitForTimeout(settle);
    navigation.loaded=true;
    navigation.finalUrl=page.url();
  } catch (e:any) {
    navigation.error=e?.message || String(e);
    navigation.finalUrl=page.url();
  }

  const state = await dumpState(page).catch(()=>({url:page.url(),title:'',width:0,height:0,bodyText:''}));
  const confirmation = await waitForUiSurfaceConfirmation(page, surface, String(before.url || instrument.chartUrl), targetUrl);
  const screenshot = await safeScreenshot(page, screenshotPath, { fullPage: true });
  const bodyText = String(state.bodyText || '');
  const label = UI_SURFACE_LABELS[surface];
  const surfaceConfirmed = Boolean(navigation.loaded && confirmation.confirmed && screenshot.exists && screenshot.bytes > 0);
  const capturedAt = new Date().toISOString();

  const out = {
    schema_version:'1.2',
    provider:'TradingView',
    ticker:instrument.symbol,
    instrument,
    surface,
    surfaceLabel:label,
    chartUrl:instrument.chartUrl,
    targetUrl,
    capturedAt,
    navigation,
    before:{url:before.url,title:before.title,width:before.width,height:before.height},
    selection:{
      found:true,
      clicked:navigation.loaded,
      strategy:'direct-public-symbol-page',
      targetUrl,
    },
    directNavigationFallback:navigation,
    final:{
      url:state.url,
      title:state.title,
      surfaceConfirmed,
      routeHint:Boolean(confirmation.routeMatched),
      contentHint:Boolean(confirmation.surfaceContent),
      bodyTextSample:bodyText.slice(0,20000),
    },
    screenshotPath,
    screenshot,
    notes:[
      'TradingView UI surface captured directly from the stable public symbol-page URL using Playwright.',
      'No Metrics launcher interaction is required for these surfaces.',
      'Screenshot is full-page to preserve the complete visible surface for later MarkItDown/visual analysis.',
      'Numeric facts are not inferred from screenshot pixels.',
    ],
  };

  await writeText(path.join(rawDir, `ui-${surface}.json`), JSON.stringify(out,null,2));
  return out;
}

async function captureConfiguredUiSurfaces(page:any, rawDir:string, screens:string, instrument:any) {
  const surfaces = configuredUiSurfaces();
  const outputs:any[] = [];
  for (const surface of surfaces) {
    const screenshotPath = path.join(screens, `tradingview-${surface}.png`);
    try {
      await page.goto(instrument.chartUrl, { waitUntil:'domcontentloaded', timeout:Number(process.env.SOURCE_TIMEOUT_MS || 120000) });
      await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 8000));
      const meta = await captureUiSurface(page, surface, screenshotPath, rawDir, instrument);
      outputs.push(meta);
    } catch (e:any) {
      const msg = e?.message || String(e);
      const failurePath = path.join(rawDir, `ui-${surface}-failure.json`);
      const failure = { schema_version:'1.0', surface, instrument, error:msg, capturedAt:new Date().toISOString() };
      await writeText(failurePath, JSON.stringify(failure,null,2));
      outputs.push({ surface, surfaceLabel:UI_SURFACE_LABELS[surface], selection:{found:false,clicked:false}, screenshot:{exists:false,bytes:0}, surfaceConfirmed:false, error:msg });
    }
  }
  return outputs;
}

export async function runTradingView(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[] = []; const gaps: string[] = []; const warnings: string[] = [];
  const raw = path.join(ctx.researchDir, 'raw', 'tradingview');
  const screens = path.join(ctx.researchDir, 'screenshots');
  await Promise.all([ensureDir(raw), ensureDir(screens)]);
  const instrument = buildTradingViewInstrument(ctx.ticker, 'NSE');
  const session = `${process.env.PLAYWRIGHT_SESSION_PREFIX || 'stock-research'}-${ctx.ticker}-tradingview`;
  const timeoutMs = Number(process.env.SOURCE_TIMEOUT_MS || 120000);
  let lastCheckpoint = 'INIT';

  try {
    lastCheckpoint = 'OPEN_CHART';
    const pageCapture = await browserRunCode(session, async page => {
      await dismiss(page);
      await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 8000));
      const state = await dumpState(page);
      await writeText(path.join(raw, 'debug-state-open-chart.json'), JSON.stringify({ instrument, state }, null, 2));
      const shot = await safeScreenshot(page, path.join(screens, 'tradingview-1d.png'));
      return { state, shot };
    }, { url: instrument.chartUrl, timeoutMs });

    await writeText(path.join(raw, 'chart-page.json'), JSON.stringify({ schema_version: '1.2', capturedAt: new Date().toISOString(), instrument, ...pageCapture.state, screenshot: pageCapture.shot }, null, 2));
    artifacts.push({ id: 'tradingview-1d', type: 'technical_chart', provider: 'TradingView', title: `TradingView ${ctx.ticker} 1D Supercharts`, url: instrument.chartUrl, localPath: path.join(raw, 'chart-page.json'), screenshotPath: path.join(screens, 'tradingview-1d.png'), retrievedAt: new Date().toISOString(), status: pageCapture.shot.bytes > 0 ? 'ok' : 'partial', method: 'playwright', notes: [`dynamicUrl=${instrument.chartUrl}`, `screenshotBytes=${pageCapture.shot.bytes}`] });

    for (const range of ['5Y', 'All'] as const) {
      lastCheckpoint = `CAPTURE_${range}`;
      const screenshotPath = path.join(screens, `tradingview-fullchart-${range.toLowerCase()}.png`);
      const meta = await browserRunCode(session, async page => {
        // Re-open the dynamic chart before each capture so stale state cannot leak between ranges.
        await page.goto(instrument.chartUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 8000));
        return captureRange(page, range, screenshotPath, instrument, raw);
      }, { timeoutMs });
      const status = meta.screenshot.bytes > 0 && meta.rangeSelection.clicked ? 'ok' : meta.screenshot.bytes > 0 ? 'partial' : 'error';
      artifacts.push({ id: `tradingview-fullchart-${range.toLowerCase()}`, type: 'technical_chart', provider: 'TradingView', title: `TradingView ${ctx.ticker} candlestick chart — ${range}`, url: instrument.chartUrl, localPath: path.join(raw, `fullchart-${range.toLowerCase()}.json`), screenshotPath, retrievedAt: meta.capturedAt, status, method: 'playwright', notes: [`range=${range}`, `rangeClicked=${meta.rangeSelection.clicked}`, `chartTypeSelected=${meta.chartType.selected}`, `screenshotExists=${meta.screenshot.exists}`, `screenshotBytes=${meta.screenshot.bytes}`] });
      if (meta.screenshot.bytes <= 0) gaps.push(`TradingView ${range} screenshot file could not be created.`);
      if (!meta.rangeSelection.clicked) warnings.push(`TradingView ${range}: range control not confirmed; screenshot retained as visual evidence.`);
    }

    // Capture TradingView symbol-page surfaces directly with Playwright.
    // These are visual/audit artifacts and never replace deterministic numeric sources.
    lastCheckpoint = 'UI_SURFACES';
    const uiSurfaces = await browserRunCode(session, async page => {
      await page.goto(instrument.chartUrl, { waitUntil:'domcontentloaded', timeout:timeoutMs });
      await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 8000));
      return captureConfiguredUiSurfaces(page, raw, screens, instrument);
    }, { timeoutMs });

    const uiSummaryPath = path.join(raw, 'ui-surfaces.json');
    await writeText(uiSummaryPath, JSON.stringify({
      schema_version:'1.0',
      provider:'TradingView',
      ticker:ctx.ticker,
      chartUrl:instrument.chartUrl,
      capturedAt:new Date().toISOString(),
      configuredSurfaces:configuredUiSurfaces(),
      surfaces:uiSurfaces,
      notes:[
        'UI surfaces are captured directly from TradingView public symbol-page URLs with Playwright.',
        'Screenshots are retained for later visual analysis.',
        'Surface text is captured for audit/debug only; numeric facts must come from structured sources.',
      ],
    }, null, 2));

    for (const meta of uiSurfaces) {
      const exists = Boolean(meta?.screenshot?.exists && Number(meta?.screenshot?.bytes || 0) > 0);
      const confirmed = Boolean(meta?.surfaceConfirmed);
      const status = exists && confirmed ? 'ok' : exists ? 'partial' : 'error';
      const surface = String(meta.surface);
      artifacts.push({
        id:`tradingview-ui-${surface}`,
        type:surface === 'news' ? 'news' : 'visual_evidence',
        provider:'TradingView',
        title:`TradingView ${ctx.ticker} ${meta.surfaceLabel || surface} UI`,
        url:meta.final?.url || instrument.chartUrl,
        localPath:path.join(raw, `ui-${surface}.json`),
        screenshotPath:path.join(screens, `tradingview-${surface}.png`),
        retrievedAt:meta.capturedAt || new Date().toISOString(),
        status,
        method:'playwright',
        notes:[
          'Opened directly from TradingView public symbol-page URLs via Playwright.',
          `strategy=${String(meta.selection?.strategy || 'direct-public-symbol-page')}`,
          `targetUrl=${String(meta.selection?.targetUrl || '')}`,
          `routeHint=${Boolean(meta.final?.routeHint)}`,
          `contentHint=${Boolean(meta.final?.contentHint)}`,
          `surfaceConfirmed=${confirmed}`,
          `screenshotBytes=${Number(meta?.screenshot?.bytes || 0)}`,
        ],
      });
      if (!exists) warnings.push(`TradingView ${meta.surfaceLabel || surface}: UI surface screenshot could not be created; supplementary visual evidence unavailable.`);
      else if (!confirmed) warnings.push(`TradingView ${meta.surfaceLabel || surface}: UI surface click/content was not fully confirmed; screenshot retained as supplementary visual evidence.`);
    }
    lastCheckpoint = 'TECHNICALS';
    const technicals = await browserRunCode(session, async page => {
      await page.goto(instrument.technicalsUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await dismiss(page); await page.waitForTimeout(2500);
      const text = await page.locator('body').innerText().catch(() => '');
      return { url: page.url(), title: await page.title(), text };
    }, { timeoutMs });
    const technicalPath = path.join(raw, 'technicals-page.json');
    await writeText(technicalPath, JSON.stringify({ schema_version: '1.1', instrument, capturedAt: new Date().toISOString(), url: technicals.url, title: technicals.title, text: technicals.text.slice(0, 12000) }, null, 2));
    const techShot = await browserRunCode(session, async page => safeScreenshot(page, path.join(screens, 'tradingview-technicals.png')), { timeoutMs });
    artifacts.push({ id: 'tradingview-technicals', type: 'technical_chart', provider: 'TradingView', title: `TradingView technicals ${ctx.ticker}`, url: instrument.technicalsUrl, localPath: technicalPath, screenshotPath: path.join(screens, 'tradingview-technicals.png'), retrievedAt: new Date().toISOString(), status: techShot.bytes > 0 && technicals.text ? 'ok' : 'partial', method: 'playwright', notes: ['Visible text only; no pixel inference.', `screenshotBytes=${techShot.bytes}`] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    gaps.push('TradingView dynamic Supercharts acquisition could not be completed.');
    warnings.push(`TradingView dynamic chart checkpoint=${lastCheckpoint}: ${msg}`);
    const failurePath = path.join(screens, 'tradingview-debug-failure.png');
    try {
      await browserRunCode(session, async page => {
        const screenshot = await safeScreenshot(page, failurePath).catch(() => ({ exists: false, bytes: 0 }));
        const state = await dumpState(page).catch(() => null);
        await writeText(path.join(raw, 'debug-failure.json'), JSON.stringify({ instrument, checkpoint: lastCheckpoint, state, screenshotPath: failurePath, screenshot }, null, 2)).catch(() => {});
      }, { timeoutMs });
    } catch {}
  }

  // Final artifact existence audit. This is separate from UI state confirmation.
  for (const f of ['tradingview-fullchart-5y.png', 'tradingview-fullchart-all.png']) {
    const p = path.join(screens, f);
    const s = await stat(p).catch(() => null);
    if (!s?.isFile() || s.size === 0) gaps.push(`TradingView screenshot missing or empty: ${f}`);
  }
  await closeBrowserSession(session).catch(() => {});
  return { artifacts, gaps: [...new Set(gaps)], warnings: [...new Set(warnings)] };
}
