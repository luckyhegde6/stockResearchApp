import path from 'node:path';
import { stat } from 'node:fs/promises';
import { browserRunCode, closeBrowserSession } from '../lib/browser.js';
import { ensureDir, writeText, fileExists } from '../lib/fs.js';
import { buildTradingViewInstrument } from '../lib/tradingview-url.js';
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


type TradingViewUiSurface =
  | 'forecast'
  | 'news'
  | 'documents'
  | 'seasonals'
  | 'community'
  | 'financials'
  | 'options'
  | 'etfs'
  | 'bonds';

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

async function clickMetricsLauncher(page:any, instrument:any) {
  // RETAINED FALLBACK (v1.49 UI approach, superseded by v1.49.5 direct
  // public symbol-page navigation in captureUiSurface). Current TradingView
  // Supercharts labels this launcher "Metrics". The tooltip is visible on
  // hover in the supplied UI and the control is the four-square/grid icon in
  // the instrument card on the right sidebar.
  const semantic = await firstVisible(page, [
    page.getByRole('button', { name: /^Metrics$/i }),
    page.locator('[aria-label="Metrics" i]'),
    page.locator('[title="Metrics" i]'),
    page.locator('[data-tooltip="Metrics" i]'),
    page.locator('[data-tooltip-content="Metrics" i]'),
    page.locator('[data-name="metrics" i]'),
    page.locator('[data-testid*="metrics" i]'),
  ]);
  if (semantic) {
    const clicked = await semantic.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (clicked) await page.waitForTimeout(Number(process.env.TRADINGVIEW_METRICS_SETTLE_MS || 700));
    return { found:true, clicked, launcher:'metrics-semantic', matchedText:await semantic.innerText().catch(()=>null), strategy:'semantic' };
  }

  const ticker = String(instrument?.symbol || '').trim();
  const company = String(instrument?.companyName || '').trim();
  const cardText = await page.evaluate(({ticker, company}) => {
    const wanted = [company, ticker].map(v => v.toUpperCase()).filter(Boolean);
    const els = [...document.querySelectorAll('div,span,a')].map((e:any) => {
      const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
      return {e,text:String(e.textContent||'').trim(),r,st};
    }).filter((x:any)=> {
      if (!x.text || x.r.width<=0 || x.r.height<=0) return false;
      if (x.r.left < window.innerWidth*0.70) return false;
      if (x.st.display==='none' || x.st.visibility==='hidden') return false;
      return wanted.includes(x.text.toUpperCase());
    }).sort((a:any,b:any)=> {
      const ac = company && a.text.toUpperCase()===company.toUpperCase() ? 1:0;
      const bc = company && b.text.toUpperCase()===company.toUpperCase() ? 1:0;
      if (ac!==bc) return bc-ac;
      return b.r.y-a.r.y;
    });
    if(!els.length) return null;
    const x=els[0];
    return {x:x.r.x,y:x.r.y,right:x.r.right,bottom:x.r.bottom,text:x.text};
  }, {ticker,company}).catch(()=>null);

  // Inspect actual interactive elements near the stock card. We score a
  // candidate as Metrics when its accessibility/title/tooltip indicates it,
  // or when its SVG looks like the four-square grid shown in the supplied UI.
  const candidates = await page.locator('button,[role="button"],a,div').evaluateAll((nodes:any[]) => {
    const vw=innerWidth, vh=innerHeight;
    const visible=(e:any)=>{const r=e.getBoundingClientRect(); const st=getComputedStyle(e); return r.width>=14&&r.height>=14&&r.width<=80&&r.height<=80&&r.right>0&&r.left<vw&&r.bottom>0&&r.top<vh&&st.display!=='none'&&st.visibility!=='hidden';};
    const clean=(v:any)=>String(v||'').trim();
    const rows:any[]=[];
    for (const e of nodes) {
      if(!visible(e)) continue;
      const r=e.getBoundingClientRect();
      if(r.left<vw*0.70) continue;
      const aria=clean(e.getAttribute('aria-label'));
      const title=clean(e.getAttribute('title'));
      const tt=clean(e.getAttribute('data-tooltip')) || clean(e.getAttribute('data-tooltip-content'));
      const dn=clean(e.getAttribute('data-name'));
      const text=clean(e.innerText||e.textContent);
      const svg=e.querySelector('svg');
      const rects=svg ? svg.querySelectorAll('rect').length : 0;
      const paths=svg ? svg.querySelectorAll('path').length : 0;
      const lines=svg ? svg.querySelectorAll('line').length : 0;
      const hint=[aria,title,tt,dn,text].join(' ');
      let score=0;
      if(/metrics/i.test(hint)) score+=100;
      if(rects>=4 && rects<=8) score+=50;
      if(/grid|menu|panel|details|fundamental|analysis/i.test(hint)) score+=10;
      if(r.left>vw*0.80) score+=5;
      rows.push({x:r.x,y:r.y,w:r.width,h:r.height,aria,title,tooltip:tt,dataName:dn,text,rects,paths,lines,score});
    }
    return rows.sort((a:any,b:any)=>b.score-a.score || a.x-b.x).slice(0,80);
  }).catch(()=>[]);

  if (cardText && candidates.length) {
    const nearby = candidates.filter((c:any)=>
      c.x >= cardText.right-8 &&
      c.x <= cardText.right+210 &&
      c.y >= cardText.y-75 &&
      c.y <= cardText.bottom+85
    );
    const selected = (nearby.length?nearby:candidates).sort((a:any,b:any)=>b.score-a.score || a.x-b.x)[0];
    if(selected) {
      const clicked = await page.mouse.click(selected.x+selected.w/2, selected.y+selected.h/2).then(()=>true).catch(()=>false);
      if(clicked) await page.waitForTimeout(Number(process.env.TRADINGVIEW_METRICS_SETTLE_MS || 700));
      return {found:true,clicked,launcher:'metrics-grid-geometry',matchedText:selected.text||null,strategy:'card-geometry',cardText,candidate:selected,nearbyCount:nearby.length};
    }
  }

  return {found:false,clicked:false,launcher:'metrics',matchedText:null,strategy:'not-found',cardText,candidates:candidates.slice(0,20)};
}

async function clickNewsAlternate(page:any, instrument:any) {
  // RETAINED FALLBACK (v1.49 UI approach, superseded by v1.49.5 direct
  // public symbol-page navigation in captureUiSurface). Alternate path shown
  // in the supplied UI: News can also be opened directly from the right-side
  // watchlist/stock panel. Prefer an exact News control and constrain
  // geometry to the right-hand panel so article headlines do not match.
  const semantic = await firstVisible(page, [
    page.getByRole('button', { name: /^News$/i }),
    page.getByRole('link', { name: /^News$/i }),
    page.locator('[aria-label="News" i]'),
    page.locator('[title="News" i]'),
    page.locator('[data-tooltip="News" i]'),
    page.locator('[data-name="news" i]'),
  ]);
  if (semantic) {
    const clicked=await semantic.click({timeout:7000}).then(()=>true).catch(()=>false);
    if(clicked) await page.waitForTimeout(Number(process.env.TRADINGVIEW_NEWS_SETTLE_MS||3000));
    return {found:true,clicked,launcher:'news-direct-semantic'};
  }

  const ticker=String(instrument?.symbol||'').trim();
  const company=String(instrument?.companyName||'').trim();
  const result=await page.locator('button,[role="button"],a,div').evaluateAll((nodes:any[])=>{
    const vw=innerWidth,vh=innerHeight;
    const rows:any[]=[];
    for(const e of nodes){
      const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
      if(r.width<=0||r.height<=0||r.left<vw*0.70||r.top<vh*0.25||r.bottom>vh||st.display==='none'||st.visibility==='hidden') continue;
      const aria=String(e.getAttribute('aria-label')||''); const title=String(e.getAttribute('title')||''); const text=String(e.innerText||e.textContent||'').trim();
      const hint=[aria,title,text].join(' ');
      if(/^news$/i.test(text)||/^news$/i.test(aria)||/^news$/i.test(title)||/\bNews\b/i.test(aria)) rows.push({x:r.x,y:r.y,w:r.width,h:r.height,aria,title,text,score:/^news$/i.test(aria)?100:/^news$/i.test(title)?90:/^news$/i.test(text)?80:50});
    }
    return rows.sort((a:any,b:any)=>b.score-a.score||a.y-b.y).slice(0,20);
  }).catch(()=>[]);
  if(result.length){
    const c=result[0];
    const clicked=await page.mouse.click(c.x+c.w/2,c.y+c.h/2).then(()=>true).catch(()=>false);
    if(clicked) await page.waitForTimeout(Number(process.env.TRADINGVIEW_NEWS_SETTLE_MS||3000));
    return {found:true,clicked,launcher:'news-right-panel-geometry',candidate:c};
  }
  return {found:false,clicked:false,launcher:'news-direct-not-found'};
}

async function openTradingViewMetricsMenu(page:any, instrument:any) {
  return clickMetricsLauncher(page,instrument);
}


async function findMetricsSurfaceItem(page:any, label:string) {
  // RETAINED FALLBACK (v1.49 UI approach, superseded by v1.49.5 direct
  // public symbol-page navigation in captureUiSurface). TradingView's current
  // Metrics launcher renders a transient menu in the right side of the chart.
  // In practice its visible text is more reliable than DOM roles/classes. We
  // therefore locate *visible exact text* in the right-side popover and return
  // its geometry for a precise click.
  const result = await page.evaluate((wantedLabel:string) => {
    const wanted = wantedLabel.trim().toLowerCase();
    const known = new Set(['financials','documents','technicals','seasonals','news','forecast','community','options','etfs','bonds']);
    const visible = (e:any) => {
      const r=e.getBoundingClientRect();
      const st=getComputedStyle(e);
      return r.width>0 && r.height>0 && r.right>0 && r.left<innerWidth &&
        r.bottom>0 && r.top<innerHeight && st.display!=='none' &&
        st.visibility!=='hidden' && st.opacity!=='0';
    };
    const exact = (e:any) => String(e.textContent||'').trim().toLowerCase()===wanted;

    const matches:any[]=[];
    for (const e of Array.from(document.querySelectorAll('button,a,[role="button"],[role="menuitem"],div,span'))) {
      if(!visible(e) || !exact(e)) continue;
      const r=e.getBoundingClientRect();
      if(r.left < innerWidth*0.62) continue;
      if(r.width > innerWidth*0.38 || r.height > 70) continue;

      // Walk a few ancestors and look for the Metrics-menu signature. The
      // screenshot shows the menu as a compact right-side vertical list.
      let p:any=e;
      let signature=0;
      let ancestor:any=null;
      for(let i=0;i<6 && p;i++,p=p.parentElement){
        if(!visible(p)) continue;
        const toks=String(p.innerText||'').split(/\n+/).map((x:string)=>x.trim().toLowerCase()).filter(Boolean);
        const hits=[...new Set(toks.filter((x:string)=>known.has(x)))];
        if(hits.includes('forecast') && hits.includes('news') && hits.includes('documents')) {
          const pr=p.getBoundingClientRect();
          if(pr.left>innerWidth*0.55 && pr.width<innerWidth*0.45 && pr.height<innerHeight*0.85){
            signature=hits.length;
            ancestor={x:pr.x,y:pr.y,w:pr.width,h:pr.height,labels:hits};
            break;
          }
        }
      }
      matches.push({x:r.x,y:r.y,w:r.width,h:r.height,text:String(e.textContent||'').trim(),signature,ancestor});
    }

    matches.sort((a,b)=>b.signature-a.signature || b.x-a.x || a.y-b.y);
    if(matches.length) return {found:true,strategy:matches[0].signature?'metrics-popover-exact-text':'metrics-rightpanel-exact-text',candidate:matches[0],candidates:matches.slice(0,20)};

    return {found:false,strategy:'exact-text-not-found',candidates:[]};
  }, label).catch((e:any)=>({found:false,strategy:`evaluate-error:${e?.message||String(e)}`,candidates:[]}));

  if(!result.found) return result;
  const c=result.candidate;
  const clicked=await page.mouse.click(c.x+c.w/2,c.y+c.h/2).then(()=>true).catch(()=>false);
  if(clicked) await page.waitForTimeout(Number(process.env.TRADINGVIEW_UI_SURFACE_SETTLE_MS || 2500));
  return {...result,clicked};
}

function tradingViewSurfaceUrl(instrument:any, surface:TradingViewUiSurface) {
  const symbol=encodeURIComponent(String(instrument?.symbol||'').trim()).replace(/%/g,'%25');
  // These public symbol pages are the primary destinations for direct
  // Playwright navigation. A chart-page SPA settle precedes each capture
  // so the surface-specific route can load reliably.
  const paths:Record<string,string> = {
    forecast:'forecast-price-target',
    news:'news',
    documents:'documents',
    seasonals:'seasonals',
    community:'community',
    financials:'financials-earnings',
    options:'options',
    etfs:'etfs',
    bonds:'bonds',
  };
  const pathPart=paths[surface] || surface;
  return `https://in.tradingview.com/symbols/NSE-${symbol}/${pathPart}/`;
}

async function directNavigateToSurface(page:any, instrument:any, surface:TradingViewUiSurface) {
  const url=tradingViewSurfaceUrl(instrument,surface);
  const timeout=Number(process.env.TRADINGVIEW_DIRECT_SURFACE_TIMEOUT_MS || 120000);
  const result:any={attempted:true,url,finalUrl:null,loaded:false,error:null};
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout});
    await page.waitForTimeout(Number(process.env.TRADINGVIEW_DIRECT_SURFACE_SETTLE_MS || 5000));
    result.finalUrl=page.url();
    result.loaded=true;
  } catch(e:any) {
    result.error=e?.message||String(e);
    result.finalUrl=page.url();
  }
  return result;
}

async function clickUiSurface(page:any, surface:TradingViewUiSurface) {
  const label = UI_SURFACE_LABELS[surface];
  const item = await findMetricsSurfaceItem(page, label);
  if (item.found) return { found:true, clicked:Boolean(item.clicked), label, strategy:item.strategy, container:item.container, item:item.item };
  return { found:false, clicked:false, label, strategy:item.strategy };
}

async function waitForUiSurfaceConfirmation(page:any, surface:TradingViewUiSurface, beforeUrl:string) {
  const deadline=Date.now()+Number(process.env.TRADINGVIEW_UI_CONFIRM_TIMEOUT_MS || 10000);
  const patterns:Record<string,RegExp>={
    forecast:/Price target|Analyst rating|Actuals and estimates|Analysts offering 1-year price forecasts/i,
    news:/Why .*share price|Latest news|Earnings|Dividends|Share buybacks|Mergers and acquisitions|Insider trading|Analysts/i,
    documents:/Documents|Earnings, Q\d|Corporate events|Interim report|Annual report/i,
    seasonals:/Historical seasonal performance|Seasonals|Seasonality|Average\s+(Percent|Return)/i,
    community:/Community|Ideas|Published|Popular ideas|Related ideas/i,
    financials:/Fundamentals and stats|Income statement|Balance sheet|Cash flow|EPS and revenue snapshot/i,
    options:/Options|Calls|Puts|Expiration/i,
    etfs:/ETFs|ETF/i,
    bonds:/Bonds|Bond/i,
  };
  const chartTokens=/Supercharts|Full chart|Vol\s+\d|1 day\s+5 days\s+1 month/i;
  let last:any={url:beforeUrl,bodyText:''};
  while(Date.now()<deadline){
    last=await dumpState(page).catch(()=>({url:beforeUrl,bodyText:''}));
    const body=String(last.bodyText||'');
    const url=String(last.url||'');
    let strong=Boolean(patterns[surface]?.test(body));

    // Public TradingView symbol pages have stable surface paths. Prefer the
    // actual destination over generic text that can exist on the chart.
    const expectedPart = {
      forecast:'/forecast-price-target/',
      news:'/news/',
      documents:'/documents/',
      seasonals:'/seasonals/',
      community:'/community/',
      financials:'/financials-',
      options:'/options/',
      etfs:'/etfs/',
      bonds:'/bonds/',
    }[surface];
    const routeMatches=expectedPart ? url.includes(expectedPart) : false;

    if(surface==='news') {
      strong = routeMatches || /Latest news|Earnings|Dividends|Share buybacks|Mergers and acquisitions|Insider trading|Analysts/i.test(body) && !chartTokens.test(body.slice(0,4000));
    } else if(surface==='documents') {
      strong = routeMatches || /Earnings, Q\d|Corporate events|Interim report|Annual report/i.test(body) && /Documents/i.test(body);
    } else if(surface==='forecast') {
      strong = routeMatches || /Price target|Analyst rating|Actuals and estimates/i.test(body);
    } else if(surface==='seasonals') {
      strong = routeMatches || /Historical seasonal performance|Seasonality/i.test(body);
    } else if(surface==='community') {
      strong = routeMatches || /Community|Ideas|Published/i.test(body) && !chartTokens.test(body.slice(0,3000));
    }

    if(strong) return {confirmed:true,routeChanged:url!==beforeUrl,surfaceContent:true,url,bodyTextSample:body.slice(0,12000)};
    await page.waitForTimeout(400);
  }
  return {confirmed:false,routeChanged:String(last.url||'')!==beforeUrl,surfaceContent:false,url:String(last.url||beforeUrl),bodyTextSample:String(last.bodyText||'').slice(0,12000)};
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
  const targetUrl = tradingViewSurfaceUrl(instrument, surface);
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
  const confirmation = await waitForUiSurfaceConfirmation(page, surface, String(before.url || instrument.chartUrl));
  const screenshot = await safeScreenshot(page, screenshotPath, { fullPage: true });
  const bodyText = String(state.bodyText || '');
  const label = UI_SURFACE_LABELS[surface];
  const surfaceConfirmed = Boolean(navigation.loaded && confirmation.confirmed && screenshot.exists && screenshot.bytes > 0);
  const capturedAt = new Date().toISOString();

  const out = {
    schema_version:'1.2',
    provider:'TradingView',
    ticker:instrument.ticker,
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
      routeHint:Boolean(confirmation.routeChanged || String(state.url||'').includes(new URL(targetUrl).pathname)),
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
