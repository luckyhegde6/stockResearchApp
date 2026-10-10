import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir, slugify, writeText } from '../lib/fs.js';
import { getBrowserSession, closeBrowserSession } from '../lib/browser.js';
import { DebugLogger } from '../lib/debug.js';
import type { SourceArtifact } from '../types/research.js';
import config from '../../config/screener-market-screens.json' with { type: 'json' };

type ScreenConfig = {
  id: string;
  name: string;
  url: string;
  folder: 'technical' | 'results';
  tags: string[];
};

type TableSnapshot = {
  headers: string[];
  rows: string[][];
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseNumber(value: string): number | null {
  const v = clean(value).replace(/,/g, '').replace(/%$/, '');
  if (!v || v === '-' || v === '—' || /^n\/a$/i.test(v)) return null;
  const negativeParen = /^\(.*\)$/.test(v);
  const numeric = v.replace(/^\(|\)$/g, '');
  const n = Number(numeric);
  if (!Number.isFinite(n)) return null;
  return negativeParen ? -n : n;
}

function canonicalizeRows(rows: TableSnapshot['rows'], headers: string[]) {
  const headerKeys = headers.map(normalizeKey);
  const get = (row: string[], ...aliases: string[]) => {
    const wanted = aliases.map(normalizeKey);
    for (const alias of wanted) {
      const idx = headerKeys.indexOf(alias);
      if (idx >= 0) return clean(row[idx]);
    }
    return '';
  };

  return rows.map((row, index) => {
    const raw = Object.fromEntries(headers.map((h, i) => [clean(h), clean(row[i] ?? '')]));
    const name = get(row, 'name', 'stock name', 'company', 'company name') || null;
    const cmpText = get(row, 'cmp rs.', 'cmp', 'current price');
    const peText = get(row, 'p/e', 'pe');
    const marketCapText = get(row, 'mar cap rs.cr.', 'market cap');
    const rsiText = get(row, 'rsi');
    const rowNumber = get(row, 's.no.', 's.no', 'serial number');

    return {
      rank: parseNumber(rowNumber) ?? index + 1,
      name,
      cmp: parseNumber(cmpText),
      pe: parseNumber(peText),
      marketCapCr: parseNumber(marketCapText),
      rsi: parseNumber(rsiText),
      raw,
    };
  });
}

function extractPageInfo(text: string): { declaredResultCount: number | null; currentPage: number | null; totalPages: number | null } {
  const m = text.match(/([\d,]+)\s+results\s+found:\s*Showing page\s+(\d+)\s+of\s+(\d+)/i);
  if (!m) return { declaredResultCount: null, currentPage: null, totalPages: null };
  return {
    declaredResultCount: Number(m[1].replace(/,/g, '')),
    currentPage: Number(m[2]),
    totalPages: Number(m[3]),
  };
}

function extractQuery(text: string): string | null {
  const marker = text.match(/Query\s*\n([\s\S]{0,800}?)(?:\n\s*Custom query example|\n\s*Only companies|\n\s*Run this Query)/i);
  return marker ? clean(marker[1]).slice(0, 800) || null : null;
}

async function getMainTable(page: any): Promise<TableSnapshot | null> {
  const tables: TableSnapshot[] = await page.locator('table').evaluateAll((els: any[]) =>
    els.map((table: any) => ({
      headers: Array.from(table.querySelectorAll('thead th')).map((x: any) => (x.textContent || '').trim()),
      rows: Array.from(table.querySelectorAll('tbody tr')).map((tr: any) =>
        Array.from(tr.querySelectorAll('td,th')).map((x: any) => (x.textContent || '').trim())
      ),
    }))
  );
  return tables
    .filter(t => t.rows.length > 0)
    .sort((a, b) => b.rows.length - a.rows.length)[0] ?? null;
}

function pageUrl(baseUrl: string, pageNumber: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set('page', String(pageNumber));
  return u.toString();
}

function isLoginRedirect(page: any): boolean {
  try {
    const url = page.url().toLowerCase();
    return /\/login(?:[/?#]|$)/.test(url);
  } catch {
    return false;
  }
}

export async function runScreenerMarketScreens(rootDir = path.join(process.cwd(), 'research', 'market-screens', 'screener')) {
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const debug = new DebugLogger(path.join(rootDir, 'debug'), process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ adapter: 'ScreenerMarketScreens', node: process.version, cwd: process.cwd(), rootDir });

  await Promise.all([
    ensureDir(rootDir),
    ensureDir(path.join(rootDir, 'technical')),
    ensureDir(path.join(rootDir, 'results')),
    ensureDir(path.join(rootDir, 'debug')),
    ensureDir(path.join(rootDir, 'search')),
  ]);

  const session = `stock-research-screener-market-screens-${Date.now()}`;
  try {
    const browserState = await getBrowserSession(session, 'default');
    await debug.emit('SCREENER/SESSION', 'OK', 'Screener public-screen browser session ready', {
      session,
      mode: browserState.mode,
      exportWorkflow: 'disabled',
      reason: 'Screener Export can redirect to login; public HTML pagination is used instead.',
    });

    const summary: any[] = [];

    for (const screen of config.screens as ScreenConfig[]) {
      const t0 = Date.now();
      const slug = slugify(screen.id || screen.name);
      const folder = path.join(rootDir, screen.folder, slug);
      const resultsPath = path.join(folder, 'results.json');
      const metadataPath = path.join(folder, 'metadata.json');
      const firstPagePath = path.join(folder, 'page-01.json');
      const screenshotPath = path.join(folder, 'screen-page-01.png');
      const pagesDir = path.join(folder, 'pages');
      await Promise.all([ensureDir(folder), ensureDir(pagesDir)]);

      await debug.emit(`SCREENER/SCREEN/${slug}`, 'START', 'Collecting Screener public screen without Export', {
        name: screen.name,
        folder: screen.folder,
        url: screen.url,
        mode: 'html-pagination',
        exportAttempted: false,
      });

      let state = await getBrowserSession(session, 'default');
      let page = state.page;
      if (page.isClosed()) page = await state.context.newPage();

      try {
        // Use a fresh page per screen so one failed/closed page cannot poison later screens.
        page = await state.context.newPage();
        const allRows: Array<any> = [];
        const pageSummaries: any[] = [];
        let firstPageInfo = { declaredResultCount: null as number | null, currentPage: null as number | null, totalPages: null as number | null };
        let query: string | null = null;
        let headers: string[] = [];

        // Page 1 establishes the expected page count and schema.
        const firstUrl = pageUrl(screen.url, 1);
        await page.goto(firstUrl, {
          waitUntil: 'domcontentloaded',
          timeout: Number(process.env.SOURCE_TIMEOUT_MS || 90000),
        });
        await page.waitForTimeout(Number(process.env.SCREENER_SETTLE_MS || 800));

        if (isLoginRedirect(page)) {
          throw new Error(`Screener redirected to login for public screen: ${page.url()}`);
        }

        const firstBodyText = clean(await page.locator('body').innerText());
        firstPageInfo = extractPageInfo(firstBodyText);
        query = extractQuery(firstBodyText);
        const firstTable = await getMainTable(page);
        if (!firstTable) throw new Error('Screener result table not found on page 1');
        headers = firstTable.headers;

        const firstCanonical = canonicalizeRows(firstTable.rows, headers);
        allRows.push(...firstCanonical);
        pageSummaries.push({
          page: 1,
          url: page.url(),
          declaredResultCount: firstPageInfo.declaredResultCount,
          currentPage: firstPageInfo.currentPage,
          totalPages: firstPageInfo.totalPages,
          rowCount: firstCanonical.length,
        });
        await writeText(path.join(pagesDir, 'page-01.json'), JSON.stringify({
          page: 1,
          url: page.url(),
          capturedAt: new Date().toISOString(),
          declaredResultCount: firstPageInfo.declaredResultCount,
          currentPage: firstPageInfo.currentPage,
          totalPages: firstPageInfo.totalPages,
          query,
          headers,
          rows: firstTable.rows,
        }, null, 2));
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const totalPages = firstPageInfo.totalPages ?? 1;
        await debug.emit(`SCREENER/SCREEN/${slug}/PLAN`, 'OK', 'Public screen pagination discovered', {
          declaredResultCount: firstPageInfo.declaredResultCount,
          totalPages,
          firstPageRows: firstCanonical.length,
          exportAttempted: false,
        });

        for (let pageNumber = 2; pageNumber <= totalPages; pageNumber++) {
          const currentUrl = pageUrl(screen.url, pageNumber);
          await debug.emit(`SCREENER/SCREEN/${slug}/PAGE_${String(pageNumber).padStart(2, '0')}`, 'START', 'Fetching public result page', {
            page: pageNumber,
            totalPages,
            url: currentUrl,
          });

          const pageStart = Date.now();
          await page.goto(currentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: Number(process.env.SOURCE_TIMEOUT_MS || 90000),
          });
          await page.waitForTimeout(Number(process.env.SCREENER_SETTLE_MS || 800));

          if (isLoginRedirect(page)) {
            throw new Error(`Screener redirected to login on page ${pageNumber}: ${page.url()}`);
          }

          const bodyText = clean(await page.locator('body').innerText());
          const pageInfo = extractPageInfo(bodyText);
          const table = await getMainTable(page);
          if (!table) throw new Error(`Screener result table not found on page ${pageNumber}`);
          const canonical = canonicalizeRows(table.rows, table.headers.length ? table.headers : headers);
          allRows.push(...canonical);

          pageSummaries.push({
            page: pageNumber,
            url: page.url(),
            declaredResultCount: pageInfo.declaredResultCount,
            currentPage: pageInfo.currentPage,
            totalPages: pageInfo.totalPages,
            rowCount: canonical.length,
          });

          await writeText(path.join(pagesDir, `page-${String(pageNumber).padStart(2, '0')}.json`), JSON.stringify({
            page: pageNumber,
            url: page.url(),
            capturedAt: new Date().toISOString(),
            declaredResultCount: pageInfo.declaredResultCount,
            currentPage: pageInfo.currentPage,
            totalPages: pageInfo.totalPages,
            query: extractQuery(bodyText) ?? query,
            headers: table.headers.length ? table.headers : headers,
            rows: table.rows,
          }, null, 2));

          await debug.emit(`SCREENER/SCREEN/${slug}/PAGE_${String(pageNumber).padStart(2, '0')}`, 'OK', 'Public result page acquired', {
            page: pageNumber,
            rowCount: canonical.length,
            declaredResultCount: pageInfo.declaredResultCount,
            durationMs: Date.now() - pageStart,
          });
        }

        // Stable deduplication by page rank + company name + key numeric fields.
        const seen = new Set<string>();
        const dedupedRows = allRows.filter(row => {
          const key = [row.rank, row.name, row.cmp, row.pe, row.marketCapCr, row.rsi].join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const duplicateCount = allRows.length - dedupedRows.length;
        const declared = firstPageInfo.declaredResultCount;
        if (declared != null && dedupedRows.length !== declared) {
          warnings.push(`Screener ${screen.name}: paginated row count ${dedupedRows.length} differs from declared result count ${declared}.`);
        }

        const metadata = {
          schema_version: '1.1',
          screen,
          capturedAt: new Date().toISOString(),
          sourceMode: 'html-pagination',
          exportAttempted: false,
          exportSkippedReason: 'Screener Export may redirect public users to login; no Export click/request is performed.',
          finalUrl: page.url(),
          declaredResultCount: declared,
          totalPages: firstPageInfo.totalPages,
          extractedRowCount: allRows.length,
          deduplicatedRowCount: dedupedRows.length,
          duplicateRowCount: duplicateCount,
          rowCountDelta: declared == null ? null : dedupedRows.length - declared,
          query,
          columns: headers,
          pages: pageSummaries,
          tags: screen.tags,
        };

        await writeText(metadataPath, JSON.stringify(metadata, null, 2));
        await writeText(firstPagePath, JSON.stringify({
          screen,
          capturedAt: new Date().toISOString(),
          finalUrl: page.url(),
          title: await page.title(),
          declaredResultCount: declared,
          totalPages: firstPageInfo.totalPages,
          query,
          headers,
          pageCount: pageSummaries.length,
        }, null, 2));
        await writeText(resultsPath, JSON.stringify({
          schema_version: '1.1',
          screen,
          capturedAt: new Date().toISOString(),
          sourceMode: 'html-pagination',
          exportAttempted: false,
          declaredResultCount: declared,
          totalPages: firstPageInfo.totalPages,
          rows: dedupedRows,
          rawColumns: headers,
        }, null, 2));

        const status = declared != null && dedupedRows.length === declared ? 'ok' : 'ok_with_fallback';
        artifacts.push({
          id: `screener-market-${slug}-results`,
          type: 'screening_results',
          provider: 'Screener.in',
          title: `${screen.name} paginated public results`,
          url: screen.url,
          localPath: resultsPath,
          screenshotPath,
          retrievedAt: new Date().toISOString(),
          status,
          method: 'playwright',
          notes: [`folder=${screen.folder}`, `rows=${dedupedRows.length}`, 'sourceMode=html-pagination', 'exportAttempted=false'],
        });
        artifacts.push({
          id: `screener-market-${slug}-metadata`,
          type: 'derived_data',
          provider: 'script',
          title: `${screen.name} pagination metadata and validation`,
          url: screen.url,
          localPath: metadataPath,
          retrievedAt: new Date().toISOString(),
          status: 'ok',
          method: 'script',
          notes: ['Deterministic pagination, row-count and schema validation.'],
        });
        artifacts.push({
          id: `screener-market-${slug}-pages`,
          type: 'source_page',
          provider: 'Screener.in',
          title: `${screen.name} page snapshots`,
          url: screen.url,
          localPath: pagesDir,
          screenshotPath,
          retrievedAt: new Date().toISOString(),
          status: 'ok',
          method: 'playwright',
          notes: [`pages=${pageSummaries.length}`, 'Public HTML pagination only; Export not used.'],
        });

        summary.push({
          id: screen.id,
          name: screen.name,
          folder: screen.folder,
          url: screen.url,
          declaredResultCount: declared,
          totalPages: firstPageInfo.totalPages,
          extractedRowCount: dedupedRows.length,
          duplicateRowCount: duplicateCount,
          sourceMode: 'html-pagination',
          exportSucceeded: false,
          exportAttempted: false,
          rowCountMatch: declared == null ? null : dedupedRows.length === declared,
        });

        await debug.emit(`SCREENER/SCREEN/${slug}`, status === 'ok' ? 'OK' : 'OK_WITH_FALLBACK', 'Screener public screen collected without Export', metadata, Date.now() - t0);
      } catch (e: any) {
        const msg = e?.message || String(e);
        gaps.push(`Screener market screen failed: ${screen.name}`);
        warnings.push(`Screener ${screen.name}: ${msg}`);
        await debug.emit(`SCREENER/SCREEN/${slug}`, 'FAIL', 'Screener screen failed', {
          error: msg,
          exportAttempted: false,
          sourceMode: 'html-pagination',
        }, Date.now() - t0);
      } finally {
        try { if (!page.isClosed()) await page.close(); } catch {}
      }
    }

    const indexPath = path.join(rootDir, 'index.json');
    await writeText(indexPath, JSON.stringify({
      schema_version: '1.1',
      generatedAt: new Date().toISOString(),
      source: 'Screener.in',
      purpose: 'Market-wide public screen snapshots for later analysis; kept separate from per-ticker research.',
      acquisitionPolicy: {
        exportUsed: false,
        exportAttempted: false,
        mode: 'html-pagination',
        reason: 'Avoid login redirect caused by Screener Export for public users.',
      },
      screens: summary,
    }, null, 2));
    artifacts.push({ id: 'screener-market-index', type: 'derived_data', provider: 'script', title: 'Screener market-screen index', localPath: indexPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Global screen snapshots intentionally stored outside per-ticker research folders.', 'Export workflow disabled by design.'] });
    await debug.emit('SCREENER/VALIDATION', gaps.length ? 'WARN' : (warnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'Screener market-screen collection complete', {
      screens: summary.length,
      artifacts: artifacts.length,
      dataGaps: gaps.length,
      warnings: warnings.length,
      exportAttempted: false,
      results: summary,
    });
  } finally {
    await closeBrowserSession(session).catch(() => {});
    await debug.finish({ status: gaps.length ? 'partial' : warnings.length ? 'ok_with_fallback' : 'ok', artifacts: artifacts.length, dataGaps: gaps.length, warnings: warnings.length });
  }
  return { artifacts, gaps, warnings };
}

async function main() {
  const root = path.join(process.cwd(), 'research', 'market-screens', 'screener');
  const r = await runScreenerMarketScreens(root);
  console.log(JSON.stringify({
    schema_version: '1.1',
    root,
    artifacts: r.artifacts.length,
    dataGaps: r.gaps.length,
    warnings: r.warnings.length,
    exportAttempted: false,
    artifactsDetail: r.artifacts,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().catch(e => { console.error(e?.stack || e); process.exitCode = 1; });
}
