import path from 'node:path';
import { browserRunCode, closeBrowserSession, getBrowserSession } from '../lib/browser.js';
import { ensureDir, writeText } from '../lib/fs.js';
import { downloadFile } from '../lib/download.js';
import { webFetchText } from '../lib/webfetch.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

const url = (ticker: string) => `https://www.screener.in/company/${encodeURIComponent(ticker)}/`;

function normalizeTable(table: any) {
  return {
    caption: String(table.caption || '').trim(),
    headers: Array.isArray(table.headers) ? table.headers.map((x: any) => String(x).trim()) : [],
    rows: Array.isArray(table.rows) ? table.rows.map((r: any[]) => r.map((x: any) => String(x ?? '').trim())) : [],
  };
}

export async function runScreener(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const raw = path.join(ctx.researchDir, 'raw', 'screener');
  const screens = path.join(ctx.researchDir, 'screenshots');
  await Promise.all([ensureDir(raw), ensureDir(screens), ensureDir(path.join(raw, 'concalls'))]);
  const target = url(ctx.ticker);
  const session = `${process.env.PLAYWRIGHT_SESSION_PREFIX || 'stock-research'}-${ctx.ticker}-screener`;

  try {
    const r = await webFetchText(target, {}, Number(process.env.SOURCE_TIMEOUT_MS || 90000));
    await writeText(path.join(raw, 'company-page.html'), r.text || '');
    artifacts.push({ id: 'screener-company-http', type: 'source_page', provider: 'Screener.in', title: 'Screener company HTTP page', url: r.finalUrl || target, localPath: path.join(raw, 'company-page.html'), retrievedAt: new Date().toISOString(), status: 'ok', method: 'webfetch', notes: [] });
  } catch (e: any) { warnings.push(`Screener direct fetch: ${e?.message || String(e)}`); }

  try {
    await getBrowserSession(session, 'default');
    const result = await browserRunCode(session, async page => {
      await page.waitForTimeout(1800);
      const text = await page.locator('body').innerText().catch(() => '');
      const title = await page.title();
      const links = await page.locator('a').evaluateAll((els: any[]) => els.map(a => ({ text: (a.innerText || a.textContent || '').trim(), href: a.href })).filter(x => x.href));
      const tables = await page.locator('table').evaluateAll((els: any[]) => els.map(t => ({
        caption: (t.querySelector('caption')?.textContent || '').trim(),
        headers: Array.from(t.querySelectorAll('thead th')).map((x: any) => (x.textContent || '').trim()),
        rows: Array.from(t.querySelectorAll('tbody tr')).map((tr: any) => Array.from(tr.querySelectorAll('td,th')).map((x: any) => (x.textContent || '').trim())),
      })));
      return { url: page.url(), title, text, links, tables };
    }, { url: target, timeoutMs: Number(process.env.SOURCE_TIMEOUT_MS || 90000), screenshotPath: path.join(screens, 'screener-company.png') });

    const jsonPath = path.join(raw, 'company-page.json');
    await writeText(jsonPath, JSON.stringify(result, null, 2));
    const snapshot = { source: 'Screener.in', ticker: ctx.ticker, capturedAt: new Date().toISOString(), url: result.url, tables: result.tables.map(normalizeTable), text: result.text };
    const snapshotPath = path.join(raw, 'fundamental-snapshot.json');
    await writeText(snapshotPath, JSON.stringify(snapshot, null, 2));
    artifacts.push({ id: 'screener-company', type: 'screener_fundamentals', provider: 'Screener.in', title: result.title || 'Screener company page', url: result.url || target, localPath: jsonPath, screenshotPath: path.join(screens, 'screener-company.png'), retrievedAt: new Date().toISOString(), status: result.text ? 'ok' : 'partial', method: 'playwright', notes: [] });
    artifacts.push({ id: 'screener-fundamental-snapshot', type: 'derived_data', provider: 'script', title: 'Deterministic Screener fundamental snapshot', url: result.url || target, localPath: snapshotPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Extracted directly from HTML tables and text; no model inference.'] });

    const pdfLinks = [...new Map((result.links || []).filter((x: any) => /\.pdf(?:$|\?)/i.test(x.href) && /concall|conference|transcript|call/i.test(`${x.text} ${x.href}`)).map((x: any) => [x.href, x])).values()].slice(0, Number(process.env.CONCALL_LIMIT || 3));
    if (!pdfLinks.length) warnings.push('Screener: no direct concall PDF links found on the current page.');
    for (let i = 0; i < pdfLinks.length; i++) {
      const out = path.join(raw, 'concalls', `screener-concall-${i + 1}.pdf`);
      try {
        const d = await downloadFile(pdfLinks[i].href, out, { Referer: target });
        artifacts.push({ id: `screener-concall-${i + 1}`, type: 'concall', provider: 'Screener.in', title: pdfLinks[i].text || `Screener concall ${i + 1}`, url: pdfLinks[i].href, localPath: out, retrievedAt: new Date().toISOString(), status: 'ok', method: 'webfetch', notes: [`bytes=${d.bytes}`] });
      } catch (e: any) { warnings.push(`Screener concall ${i + 1}: ${e?.message || String(e)}`); }
    }
  } catch (e: any) {
    gaps.push('Screener company page could not be automated.');
    warnings.push(`Screener Playwright: ${e?.message || String(e)}`);
  } finally { await closeBrowserSession(session).catch(() => {}); }

  return { artifacts, gaps, warnings };
}
