import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir, writeText } from '../lib/fs.js';
import { getBrowserSession, closeBrowserSession } from '../lib/browser.js';
import { DebugLogger } from '../lib/debug.js';
import type { SourceArtifact } from '../types/research.js';

type ScreenSpec = {
  id: 'quarterly-results' | 'upcoming-results' | 'ideas-dashboard';
  name: string;
  url: string;
  folder: 'quarterly-results' | 'upcoming-results' | 'macro';
  kind: 'results' | 'upcoming' | 'macro';
};

const SCREENS: ScreenSpec[] = [
  { id: 'quarterly-results', name: 'Latest Quarterly Results', url: 'https://www.tijorifinance.com/results/quarterly-results/', folder: 'quarterly-results', kind: 'results' },
  { id: 'upcoming-results', name: 'Upcoming Corporate Results and Events', url: 'https://www.tijorifinance.com/results/upcoming-events/', folder: 'upcoming-results', kind: 'upcoming' },
  { id: 'ideas-dashboard', name: 'Tijori Ideas Dashboard / Market Intelligence', url: 'https://www.tijorifinance.com/ideas-dashboard/', folder: 'macro', kind: 'macro' },
];

const IDEA_CATEGORIES = [
  'Promoter Buying','Rating Upgrades','Trending on Social Media','Fund Raise / QIP','Capex Announcement',
  'Corporate Actions','Merger','Demerger','Buyback','Price Pessimism','Margin Expansion','Consistent Sales Growth',
  'Deleveraging','Coffee Can','Whales Buying','Upcoming results','Popular with Small Cap Mutual Funds',
  'Trending Smallcaps on Tijori','Top Gainers - 1 Day','Top Losers - 1 Day',
];

function clean(v: unknown): string { return String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeKey(v: string): string { return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function parseNumber(v: string | undefined): number | null {
  if (!v) return null;
  const s = clean(v).replace(/,/g, '').replace(/₹/g, '').replace(/%$/g, '');
  if (!s || /^[-—–]$/.test(s) || /^n\/a$/i.test(s)) return null;
  const paren = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/^\(|\)$/g, ''));
  return Number.isFinite(n) ? (paren ? -n : n) : null;
}
function parseDate(text: string): string | null {
  const m = clean(text).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
  return m ? m[0] : null;
}


function extractQuarterlyCardsFromBodyText(text: string): any[] {
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const out: any[] = [];
  const seen = new Set<string>();
  const dateRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i;
  const pct = (v: string | undefined) => parseNumber(v);
  for (let i = 0; i < lines.length; i++) {
    if (!/M\s*Cap\s*:/i.test(lines[i]) || !/PE\s*:/i.test(lines[i])) continue;
    const heading = lines[i - 1] || '';
    const headingDate = heading.match(dateRe);
    const company = headingDate ? heading.slice(0, headingDate.index).trim() : heading.trim();
    const block = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 12));
    const rawText = block.join(' | ');
    const mCap = lines[i].match(/M\s*Cap\s*:\s*₹?\s*([\d,]+(?:\.\d+)?)\s*(?:Cr\.?|Crs?\.?)?/i);
    const pe = lines[i].match(/PE\s*:\s*([\d,]+(?:\.\d+)?)/i);
    let salesYoy: number | null = null, salesQoq: number | null = null, sales: number | null = null, salesPrev: number | null = null, salesYoyCmp: number | null = null;
    let opYoy: number | null = null, opQoq: number | null = null, op: number | null = null, opPrev: number | null = null, opYoYP: number | null = null;
    let npYoy: number | null = null, npQoq: number | null = null, np: number | null = null, npPrev: number | null = null, npYoYP: number | null = null;
    let epsYoy: number | null = null, epsQoq: number | null = null, eps: number | null = null, epsPrev: number | null = null, epsYoYP: number | null = null;
    const metricLines = ['Sales','Operating Profit','Net Profit','EPS'];
    for (const metric of metricLines) {
      const idx = lines.findIndex((line, j) => j > i && j < Math.min(lines.length, i + 14) && new RegExp('^' + metric.replace(' ', '\\s+') + '\\s*$', 'i').test(line));
      if (idx < 0) continue;
      const vals: number[] = [];
      for (let k = idx + 1; k < Math.min(lines.length, idx + 7); k++) {
        if (metricLines.some(m => new RegExp('^' + m.replace(' ', '\\s+') + '\\s*$', 'i').test(lines[k]))) break;
        const tokens = lines[k].split(/\s+/).map(t => t.replace(/[()%₹,]/g, ''));
        for (const token of tokens) {
          const n = Number(token);
          if (Number.isFinite(n)) vals.push(n);
        }
        if (vals.length >= 5) break;
      }
      const y = idx + 0;
      const source = lines[idx + 1] || '';
      const nums = source.split(/\s+/).map(t => parseNumber(t)).filter((v): v is number => v !== null);
      const arr = nums.length ? nums : vals;
      if (metric === 'Sales') { salesYoy = arr[0] ?? null; salesQoq = arr[1] ?? null; sales = arr[2] ?? null; salesPrev = arr[3] ?? null; salesYoyCmp = arr[4] ?? null; }
      if (metric === 'Operating Profit') { opYoy = arr[0] ?? null; opQoq = arr[1] ?? null; op = arr[2] ?? null; opPrev = arr[3] ?? null; opYoYP = arr[4] ?? null; }
      if (metric === 'Net Profit') { npYoy = arr[0] ?? null; npQoq = arr[1] ?? null; np = arr[2] ?? null; npPrev = arr[3] ?? null; npYoYP = arr[4] ?? null; }
      if (metric === 'EPS') { epsYoy = arr[0] ?? null; epsQoq = arr[1] ?? null; eps = arr[2] ?? null; epsPrev = arr[3] ?? null; epsYoYP = arr[4] ?? null; }
    }
    if (!company && !headingDate) continue;
    const key = `${company}|${headingDate?.[0] || ''}|${mCap?.[1] || ''}|${pe?.[1] || ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      company: company || null,
      ticker: null,
      href: null,
      date: headingDate?.[0] || null,
      marketCap: mCap ? pct(mCap[1]) : null,
      pe: pe ? pct(pe[1]) : null,
      salesYoy, salesQoq, sales, salesPrev, salesYoyCmp,
      operatingProfitYoy: opYoy, operatingProfitQoq: opQoq, operatingProfit: op, operatingProfitPrev: opPrev, operatingProfitYoyCmp: opYoYP,
      netProfitYoy: npYoy, netProfitQoq: npQoq, netProfit: np, netProfitPrev: npPrev, netProfitYoyCmp: npYoYP,
      epsYoy, epsQoq, eps, epsPrev, epsYoyCmp: epsYoYP,
      rawText,
      sourceMethod: 'dom-body-text',
    });
  }
  return out;
}

function canonicalResultRows(tables: any[]) {
  const out: any[] = [];
  for (const table of tables || []) {
    const headers = (table.headers || []).map((x: any) => clean(x));
    const keys = headers.map(normalizeKey);
    if (!headers.length) continue;
    const get = (row: string[], aliases: string[]) => {
      for (const alias of aliases.map(normalizeKey)) {
        const i = keys.indexOf(alias);
        if (i >= 0) return row[i] ?? '';
      }
      return '';
    };
    for (const row of table.rows || []) {
      const raw = Object.fromEntries(headers.map((h: string, i: number) => [h, row[i] ?? '']));
      const company = get(row, ['Company','Stock','Name','Company Name']);
      const ticker = get(row, ['Ticker','Symbol','NSE Code']);
      if (!company && !ticker) continue;
      out.push({
        company: company || null,
        ticker: ticker || null,
        date: get(row, ['Date','Result Date','Announcement Date']) || null,
        marketCap: parseNumber(get(row, ['Market Cap','Market Cap Cr','M Cap'])),
        pe: parseNumber(get(row, ['PE','P/E'])),
        salesYoy: parseNumber(get(row, ['Sales YOY%','Sales YOY','Sales Growth YOY'])),
        operatingProfitYoy: parseNumber(get(row, ['Operating Profit YOY%','Operating Profit YOY'])),
        netProfitYoy: parseNumber(get(row, ['Net Profit YOY%','Net Profit YOY'])),
        epsYoy: parseNumber(get(row, ['EPS YOY%','EPS YOY'])),
        raw,
      });
    }
  }
  return out;
}

async function extractQuarterlyCards(page: any) {
  return page.evaluate(() => {
    const cleanLocal = (v: unknown) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const parseNum = (v: string | undefined) => {
      if (!v) return null;
      const s = cleanLocal(v).replace(/,/g, '').replace(/₹/g, '').replace(/%$/g, '');
      if (!s || /^[-—–]$/.test(s)) return null;
      const n = Number(s.replace(/^\(|\)$/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const parseDateLocal = (text: string) => {
      const m = cleanLocal(text).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
      return m ? m[0] : null;
    };
    const dateRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i;
    const companyAnchors = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
    const seen = new Set<string>();
    const cards: any[] = [];
    for (const link of companyAnchors) {
      const anchorText = cleanLocal(link.innerText || link.textContent);
      if (!anchorText || /view detailed financials|filter|sort|companies/i.test(anchorText)) continue;
      let el: Element | null = link;
      let best: Element | null = null;
      for (let depth = 0; depth < 12 && el; depth++, el = el.parentElement) {
        const text = cleanLocal((el as HTMLElement).innerText || el.textContent);
        if (text.length < 80 || text.length > 7000) continue;
        if (/M Cap\s*:/i.test(text) && /PE\s*:/i.test(text) && /Sales/i.test(text) && /Net Profit/i.test(text) && dateRe.test(text)) {
          best = el;
          break;
        }
      }
      if (!best) continue;
      const text = cleanLocal((best as HTMLElement).innerText || best.textContent);
      const key = `${link.href}|${text.slice(0, 300)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mCap = text.match(/M Cap\s*:\s*₹?([\d,]+(?:\.\d+)?)/i);
      const pe = text.match(/PE\s*:\s*([\d,]+(?:\.\d+)?)/i);
      cards.push({
        company: anchorText,
        href: link.href,
        ticker: (text.match(/\b[A-Z][A-Z0-9]{2,14}\b/) || [])[0] || null,
        date: parseDateLocal(text),
        marketCap: mCap ? parseNum(mCap[1]) : null,
        pe: pe ? parseNum(pe[1]) : null,
        rawText: text,
        sourceMethod: 'dom-card',
      });
    }
    return cards;
  });
}

async function extractUpcomingCards(page: any) {
  return page.evaluate(() => {
    const cleanLocal = (v: unknown) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
    const seen = new Set<string>();
    const out: any[] = [];
    for (const link of links) {
      const name = cleanLocal(link.innerText || link.textContent);
      if (!name || name.length > 140 || /view all|filter|search|home/i.test(name)) continue;
      let el: Element | null = link;
      let best: Element | null = null;
      for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
        const text = cleanLocal((el as HTMLElement).innerText || el.textContent);
        if (text.length >= 20 && text.length <= 2000 && /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(text)) { best = el; break; }
      }
      if (!best) continue;
      const rawText = cleanLocal((best as HTMLElement).innerText || best.textContent);
      const key = `${link.href}|${rawText.slice(0,300)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ company: name, href: link.href, ticker: (rawText.toUpperCase().match(/\b[A-Z][A-Z0-9]{2,14}\b/) || [])[0] || null, date: rawText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i)?.[0] || null, rawText, sourceMethod: 'dom-upcoming-card' });
    }
    return out;
  });
}

async function extractIdeas(page: any) {
  return page.evaluate((categories: string[]) => {
    const cleanLocal = (v: unknown) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = (document.body?.innerText || '').split(/\r?\n/).map(cleanLocal).filter(Boolean);
    const categoryIndexes = categories.map(c => ({ c, i: lines.findIndex(line => line.toLowerCase() === c.toLowerCase()) })).filter(x => x.i >= 0);
    const ideas: any[] = [];
    for (let idx = 0; idx < categoryIndexes.length; idx++) {
      const { c, i } = categoryIndexes[idx];
      const end = idx + 1 < categoryIndexes.length ? categoryIndexes[idx + 1].i : lines.length;
      for (let p = i + 1; p < end && ideas.filter(x => x.category === c).length < 100; p++) {
        const line = lines[p];
        if (/^view all$/i.test(line) || /^updates every/i.test(line) || /^(merger|demerger|buyback)$/i.test(line)) continue;
        const match = line.match(/^(.+?)\s+([A-Z][A-Z0-9]{2,14})$/);
        if (!match) continue;
        const company = match[1].trim();
        const ticker = match[2].trim();
        const next = lines[p + 1] || '';
        const capSector = next.match(/^(Large|Mid|Small|Micro|Nano) cap\s+(.+)$/i);
        const sector = capSector ? capSector[2].trim() : null;
        const key = `${c}|${ticker}|${company}`;
        if (!ideas.some(x => `${x.category}|${x.ticker}|${x.company}` === key)) ideas.push({ category: c, company, ticker, size: capSector ? capSector[1] : null, sector, context: capSector ? next : null, sourceMethod: 'body-lines' });
      }
    }
    return { headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5')).map((h: any) => cleanLocal(h.innerText || h.textContent)).filter(Boolean), ideas };
  }, IDEA_CATEGORIES);
}

async function capturePage(page: any, navigateUrl: string) {
  const responseLog: any[] = [];
  const handler = async (response: any) => {
    try {
      const url = response.url();
      if (!/tijorifinance\.com/i.test(url)) return;
      const type = response.request().resourceType();
      const ct = String(response.headers()['content-type'] || '');
      if (!['xhr', 'fetch', 'document'].includes(type) || !/json|text|javascript|html/i.test(ct)) return;
      const body = await response.text().catch(() => '');
      responseLog.push({ url, status: response.status(), contentType: ct, body: body.slice(0, 1_500_000) });
    } catch {}
  };
  page.on('response', handler);
  if (navigateUrl) {
    await page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: Number(process.env.SOURCE_TIMEOUT_MS || 90000) });
  }
  await page.waitForTimeout(Number(process.env.TIJORI_SETTLE_MS || 2500));
  const data = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: document.body?.innerText || '',
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5')).map((x: any) => (x.innerText || x.textContent || '').trim()).filter(Boolean),
    links: Array.from(document.querySelectorAll('a')).map((a: any) => ({ text: (a.innerText || a.textContent || '').trim(), href: a.href })).filter((x: any) => x.href),
    tables: Array.from(document.querySelectorAll('table')).map((table: any) => ({
      headers: Array.from(table.querySelectorAll('thead th,thead td')).map((x: any) => (x.textContent || '').trim()),
      rows: Array.from(table.querySelectorAll('tbody tr')).map((tr: any) => Array.from(tr.querySelectorAll('td,th')).map((x: any) => (x.textContent || '').trim())).filter((r: any[]) => r.some(Boolean)),
    })).filter((t: any) => t.rows.length),
  }));
  const quarterlyCards = [
    ...(await extractQuarterlyCards(page).catch(() => [])),
    ...extractQuarterlyCardsFromBodyText(data.text),
  ];
  const upcomingCards = await extractUpcomingCards(page).catch(() => []);
  const ideas = await extractIdeas(page).catch(() => ({ headings: [], ideas: [] }));
  const candidateLinks = await page.locator('a').count().catch(() => 0);
  page.off('response', handler);
  return { ...data, quarterlyCards, upcomingCards, ideas, networkResponses: responseLog, candidateLinks };
}

async function clickLoadMore(page: any): Promise<{ clicked: boolean; before: number; after: number; text?: string }> {
  const candidates = [
    page.getByRole('button', { name: /show more|load more/i }),
    page.getByText(/show more|load more/i, { exact: false }),
    page.locator('button, [role="button"], a').filter({ hasText: /show more|load more/i }),
  ];
  let before = await page.locator('a').count().catch(() => 0);
  const beforeTextLength = (await page.locator('body').innerText().catch(() => '')).length;
  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      if (await item.isDisabled?.().catch(() => false)) continue;
      const text = await item.innerText().catch(() => '');
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await item.click({ timeout: 15000 }).catch(() => {});
      const changed = await page.waitForFunction(({ oldCount, oldTextLength }: { oldCount: number; oldTextLength: number }) => {
        const links = document.querySelectorAll('a').length;
        const textLength = (document.body?.innerText || '').length;
        return links > oldCount || textLength > oldTextLength + 120;
      }, { oldCount: before, oldTextLength: beforeTextLength }, { timeout: 12000 }).catch(() => false);
      const after = await page.locator('a').count().catch(() => before);
      const afterTextLength = (await page.locator('body').innerText().catch(() => '')).length;
      return { clicked: Boolean(changed) || after > before || afterTextLength > beforeTextLength + 120, before, after, text };
    }
  }
  return { clicked: false, before, after: before };
}

async function collectDataset(spec: ScreenSpec, root: string, debug: DebugLogger) {
  const dir = path.join(root, spec.folder);
  const pagesDir = path.join(dir, 'pages');
  await ensureDir(pagesDir);
  const session = `stock-research-tijori-${spec.id}-${Date.now()}`;
  const state = await getBrowserSession(session, 'default');
  const page = state.page;
  const allRows: any[] = [];
  const pageSummaries: any[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const maxIterations = spec.kind === 'results' ? Number(process.env.TIJORI_QUARTERLY_MAX_ITERATIONS || 100) : Number(process.env.TIJORI_MARKET_MAX_ITERATIONS || 30);
  let stagnant = 0;

  try {
    await debug.emit(`TIJORI/${spec.id}`, 'START', 'Collecting Tijori market dataset', { url: spec.url, folder: spec.folder, maxIterations });
    await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.SOURCE_TIMEOUT_MS || 90000) });

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      await page.waitForTimeout(Number(process.env.TIJORI_SETTLE_MS || 2200));
      const capture = await capturePage(page, '');
      const tableRows = canonicalResultRows(capture.tables || []);
      const extractedRows = spec.kind === 'results'
        ? [...(capture.quarterlyCards || []), ...tableRows.map((r: any) => ({ ...r, sourceMethod: 'dom-table' }))]
        : spec.kind === 'upcoming'
          ? [...(capture.upcomingCards || []), ...tableRows.map((r: any) => ({ ...r, sourceMethod: 'dom-table' }))]
          : (capture.ideas?.ideas || []);

      const prefix = `page-${String(iteration).padStart(3, '0')}`;
      const jsonPath = path.join(pagesDir, `${prefix}.json`);
      const htmlPath = path.join(pagesDir, `${prefix}.html`);
      await writeText(jsonPath, JSON.stringify(capture, null, 2));
      await writeText(htmlPath, await page.content());
      if (process.env.TIJORI_SCREENSHOTS !== 'false') await page.screenshot({ path: path.join(pagesDir, `${prefix}.png`), fullPage: true }).catch(() => {});

      const info = {
        iteration,
        url: capture.url,
        extractedRows: extractedRows.length,
        tableRows: tableRows.length,
        tables: capture.tables?.length || 0,
        quarterlyCards: capture.quarterlyCards?.length || 0,
        upcomingCards: capture.upcomingCards?.length || 0,
        ideas: capture.ideas?.ideas?.length || 0,
        networkResponses: capture.networkResponses.length,
        candidateLinks: capture.candidateLinks,
        headings: capture.headings?.slice(0, 50) || [],
        jsonPath,
        htmlPath,
      };
      pageSummaries.push(info);
      await debug.emit(`TIJORI/${spec.id}/PAGE_${String(iteration).padStart(3, '0')}`, extractedRows.length ? 'OK' : 'WARN', extractedRows.length ? 'Page/batch captured' : 'Page captured but no normalized rows were found', info);
      if (extractedRows.length) { allRows.push(...extractedRows); stagnant = 0; } else stagnant += 1;

      if (spec.kind === 'macro') break;
      if (stagnant >= 2) {
        warnings.push(`Tijori ${spec.name}: no new normalized rows for ${stagnant} consecutive iterations.`);
        break;
      }

      const beforeSignature = `${await page.locator('a').count().catch(() => 0)}|${(await page.locator('body').innerText().catch(() => '')).length}|${await page.locator('table tbody tr').count().catch(() => 0)}`;
      const loadMore = await clickLoadMore(page);
      const afterSignature = `${loadMore.after}|${(await page.locator('body').innerText().catch(() => '')).length}|${await page.locator('table tbody tr').count().catch(() => 0)}`;
      await debug.emit(`TIJORI/${spec.id}/LOAD_MORE`, loadMore.clicked ? 'OK' : 'WARN', loadMore.clicked ? 'Load More added content without reloading page' : 'No additional Show More / Load More content available', { beforeSignature, afterSignature, beforeCount: loadMore.before, afterCount: loadMore.after, label: loadMore.text || null });
      if (loadMore.clicked) continue;

      const next = page.getByRole('link', { name: /^next$/i });
      if (await next.count().catch(() => 0) > 0 && await next.first().isVisible().catch(() => false)) {
        await next.first().click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      break;
    }

    const unique = new Map<string, any>();
    for (const row of allRows) {
      const key = [row.ticker || '', row.company || '', row.date || '', row.href || '', JSON.stringify(row.metrics || row.raw || '')].join('|').toLowerCase();
      if (!unique.has(key)) unique.set(key, row);
    }
    const deduped = [...unique.values()];
    if (deduped.length === 0) gaps.push(`Tijori ${spec.name}: no usable rows extracted.`);

    const resultsPath = path.join(dir, 'results.json');
    const metadataPath = path.join(dir, 'metadata.json');
    const summaryPath = path.join(dir, 'summary.json');
    const status = deduped.length ? 'ok' : 'partial';

    let payload: any;
    if (spec.kind === 'macro') {
      const ideas = deduped;
      payload = { schema_version: '1.3', source: 'Tijori Finance', screen: spec, capturedAt: new Date().toISOString(), url: spec.url, finalUrl: page.url(), ideas, ideasByCategory: ideas.reduce((acc: Record<string, any[]>, row: any) => { (acc[row.category || 'unclassified'] ||= []).push(row); return acc; }, {}), headings: pageSummaries[0]?.headings || [], networkResponses: (JSON.parse(await (await import('node:fs/promises')).readFile(path.join(pagesDir, 'page-001.json'), 'utf8'))).networkResponses || [] };
    } else {
      payload = { schema_version: '1.3', source: 'Tijori Finance', screen: spec, capturedAt: new Date().toISOString(), url: spec.url, finalUrl: page.url(), rows: deduped, rawRowCount: allRows.length, deduplicatedRowCount: deduped.length, pages: pageSummaries.length };
    }
    await writeText(resultsPath, JSON.stringify(payload, null, 2));
    await writeText(metadataPath, JSON.stringify({ schema_version: '1.3', screen: spec, capturedAt: new Date().toISOString(), sourceMode: spec.kind === 'macro' ? 'public-html-ideas-dashboard' : 'public-html-dynamic', exportAttempted: false, loginRequired: false, pageCount: pageSummaries.length, pageSummaries, rawRowCount: allRows.length, deduplicatedRowCount: deduped.length, completeness: { status, rowsExtracted: deduped.length }, llmUsed: false }, null, 2));
    await writeText(summaryPath, JSON.stringify({ id: spec.id, name: spec.name, folder: spec.folder, url: spec.url, finalUrl: page.url(), pageCount: pageSummaries.length, rows: deduped.length, status, capturedAt: new Date().toISOString() }, null, 2));

    const artifacts: SourceArtifact[] = [
      { id: `tijori-market-${spec.id}`, type: 'market_screen', provider: 'Tijori Finance', title: spec.name, url: spec.url, localPath: resultsPath, retrievedAt: new Date().toISOString(), status: status as any, method: 'playwright', notes: [`pages=${pageSummaries.length}`, `rows=${deduped.length}`, 'No Export/login workflow used.', 'No LLM used.'] },
      { id: `tijori-market-${spec.id}-metadata`, type: 'derived_data', provider: 'script', title: `${spec.name} metadata`, url: spec.url, localPath: metadataPath, retrievedAt: new Date().toISOString(), status: status as any, method: 'script', notes: ['Completeness is based on captured dynamic content; zero-row datasets are never marked complete.'] },
    ];
    await debug.emit(`TIJORI/${spec.id}`, status === 'ok' ? 'OK' : 'WARN', status === 'ok' ? 'Tijori market dataset complete' : 'Tijori market dataset collected partially', { pages: pageSummaries.length, rows: deduped.length, warnings: warnings.length, gaps: gaps.length, status });
    return { artifacts, gaps, warnings, summary: { id: spec.id, rows: deduped.length, pages: pageSummaries.length, status } };
  } catch (e: any) {
    const msg = e?.message || String(e);
    gaps.push(`Tijori ${spec.name}: collection failed.`);
    warnings.push(`Tijori ${spec.name}: ${msg}`);
    await debug.emit(`TIJORI/${spec.id}`, 'FAIL', 'Tijori market dataset failed', { error: msg });
    return { artifacts: [], gaps, warnings, summary: { id: spec.id, error: msg, status: 'error' } };
  } finally {
    await closeBrowserSession(session).catch(() => {});
  }
}

export async function runTijoriMarketScreens(root: string) {
  await ensureDir(root);
  const debug = new DebugLogger(path.join(root, 'debug'), process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ adapter: 'TijoriMarketScreens', node: process.version, cwd: process.cwd(), root });
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const summaries: any[] = [];
  for (const spec of SCREENS) {
    const result = await collectDataset(spec, root, debug);
    artifacts.push(...result.artifacts);
    gaps.push(...result.gaps);
    warnings.push(...result.warnings);
    summaries.push(result.summary);
  }
  const uniqueGaps = [...new Set(gaps)];
  const uniqueWarnings = [...new Set(warnings)];
  const index = { schema_version: '1.2', source: 'Tijori Finance', generatedAt: new Date().toISOString(), root, screens: SCREENS, summaries, artifacts: artifacts.map(a => ({ id: a.id, type: a.type, localPath: a.localPath, status: a.status })), dataGaps: uniqueGaps, warnings: uniqueWarnings, llmUsed: false };
  await writeFile(path.join(root, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  await debug.emit('TIJORI/VALIDATION', uniqueGaps.length ? 'WARN' : (uniqueWarnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'Tijori market-screen collection complete', { screens: SCREENS.length, artifacts: artifacts.length, dataGaps: uniqueGaps.length, warnings: uniqueWarnings.length, summaries });
  return { artifacts, gaps: uniqueGaps, warnings: uniqueWarnings, index };
}
