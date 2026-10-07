import path from 'node:path';
import { browserRunCode, closeBrowserSession } from '../lib/browser.js';
import { ensureDir, slugify, writeText } from '../lib/fs.js';
import { downloadFile } from '../lib/download.js';
import { webFetchText } from '../lib/webfetch.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

const pageUrl = (ctx: AdapterContext) => process.env.TIJORI_URL || `https://www.tijorifinance.com/company/${slugify(ctx.companyName || `${ctx.ticker} industries limited`)}/`;

export async function runTijori(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const raw = path.join(ctx.researchDir, 'raw', 'tijori');
  const screens = path.join(ctx.researchDir, 'screenshots');
  await Promise.all([ensureDir(raw), ensureDir(screens), ensureDir(path.join(raw, 'concalls'))]);
  const target = pageUrl(ctx);
  const session = `${process.env.PLAYWRIGHT_SESSION_PREFIX || 'stock-research'}-${ctx.ticker}-tijori`;

  try {
    const r = await webFetchText(target, {}, Number(process.env.SOURCE_TIMEOUT_MS || 90000));
    await writeText(path.join(raw, 'company-page.html'), r.text || '');
    artifacts.push({ id: 'tijori-company-http', type: 'source_page', provider: 'Tijori Finance', title: 'Tijori company HTTP page', url: r.finalUrl || target, localPath: path.join(raw, 'company-page.html'), retrievedAt: new Date().toISOString(), status: 'ok', method: 'webfetch', notes: [] });
  } catch (e: any) { warnings.push(`Tijori direct fetch: ${e?.message || String(e)}`); }

  try {
    const result = await browserRunCode(session, async page => {
      await page.waitForTimeout(2500);
      const text = await page.locator('body').innerText().catch(() => '');
      const links = await page.locator('a').evaluateAll((els: any[]) => els.map(a => ({ text: (a.innerText || a.textContent || '').trim(), href: a.href })).filter(x => x.href));
      return { url: page.url(), title: await page.title(), text, links };
    }, { url: target, timeoutMs: Number(process.env.SOURCE_TIMEOUT_MS || 90000), screenshotPath: path.join(screens, 'tijori-company.png') });
    const jsonPath = path.join(raw, 'company-page.json');
    await writeText(jsonPath, JSON.stringify(result, null, 2));
    const snapshotPath = path.join(raw, 'financial-context.json');
    await writeText(snapshotPath, JSON.stringify({ source: 'Tijori Finance', ticker: ctx.ticker, capturedAt: new Date().toISOString(), url: result.url, text: result.text }, null, 2));
    artifacts.push({ id: 'tijori-company', type: 'source_page', provider: 'Tijori Finance', title: result.title || 'Tijori company page', url: result.url || target, localPath: jsonPath, screenshotPath: path.join(screens, 'tijori-company.png'), retrievedAt: new Date().toISOString(), status: result.text ? 'ok' : 'partial', method: 'playwright', notes: ['Secondary source for financial context and conference-call material.'] });
    artifacts.push({ id: 'tijori-financial-context', type: 'derived_data', provider: 'script', title: 'Deterministic Tijori financial context snapshot', url: result.url || target, localPath: snapshotPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Text captured directly; no model inference.'] });

    const pdfLinks = [...new Map((result.links || []).filter((x: any) => /\.pdf(?:$|\?)/i.test(x.href) && /conference|concall|call/i.test(`${x.text} ${x.href}`)).map((x: any) => [x.href, x])).values()].slice(0, Number(process.env.CONCALL_LIMIT || 3));
    if (!/conference call|concall/i.test(result.text || '')) warnings.push('Tijori: conference-call section not detected in page text.');
    for (let i = 0; i < pdfLinks.length; i++) {
      const out = path.join(raw, 'concalls', `tijori-concall-${i + 1}.pdf`);
      try {
        const d = await downloadFile(pdfLinks[i].href, out, { Referer: target });
        artifacts.push({ id: `tijori-concall-${i + 1}`, type: 'concall', provider: 'Tijori Finance', title: pdfLinks[i].text || `Tijori conference call ${i + 1}`, url: pdfLinks[i].href, localPath: out, retrievedAt: new Date().toISOString(), status: 'ok', method: 'webfetch', notes: [`bytes=${d.bytes}`] });
      } catch (e: any) { warnings.push(`Tijori concall ${i + 1}: ${e?.message || String(e)}`); }
    }
  } catch (e: any) { gaps.push('Tijori company page could not be automated.'); warnings.push(`Tijori Playwright: ${e?.message || String(e)}`); }
  finally { await closeBrowserSession(session).catch(() => {}); }

  return { artifacts, gaps, warnings };
}
