import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'EQUITY_L.csv');
const CATALOG_PATH = path.join(ROOT, 'data', 'nse-index-catalog.json');
const OUT_JSON_PATH = path.join(ROOT, 'data', 'nse-symbols-reference.json');
const OUT_META_PATH = path.join(ROOT, 'data', 'nse-symbols-reference.meta.json');

const NSE_SERIES_LEGEND = [
  { seriesPattern: 'EQ', description: 'Fully paid equity shares / ETFs', settlementType: 'Rolling Settlement', class: 'fully_paid_equity_or_etf', equityUniverse: true, preferredForStandardStockQuote: true },
  { seriesPattern: 'BE/BZ', description: 'Trade-for-trade / surveillance equity categories', settlementType: 'Trade for Trade', class: 'fully_paid_equity_or_etf', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'SM', description: 'Fully paid equity shares SME', settlementType: 'Rolling Settlement', class: 'fully_paid_equity_sme', equityUniverse: true, preferredForStandardStockQuote: true },
  { seriesPattern: 'ST/SZ', description: 'SME trade-for-trade categories', settlementType: 'Trade for Trade', class: 'fully_paid_equity_sme', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'E@', description: 'Partly paid equity shares', class: 'partly_paid_equity', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'X@', description: 'Partly paid trade-for-trade category', class: 'partly_paid_equity', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'MF', description: 'Closed ended mutual fund units', class: 'mutual_fund', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'ME', description: 'Mutual fund trade-for-trade category', class: 'mutual_fund', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'P@', description: 'Non-convertible preference shares', class: 'preference_share', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'Q@', description: 'Fully convertible preference shares', class: 'preference_share', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'N@/Y@/Z@/A@/B@', description: 'Non-convertible debt instruments', class: 'debt', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'D@', description: 'Fully convertible debt instruments', class: 'debt', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'W@', description: 'Convertible warrants', class: 'warrant', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'IV', description: 'Units of InvITs', class: 'invit', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'GB', description: 'Gold Bonds', class: 'gold_bond', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'GS', description: 'Government Securities', class: 'government_security', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'RR', description: 'Units of REITs', class: 'reit', equityUniverse: true, preferredForStandardStockQuote: false },
  { seriesPattern: 'BE', description: 'Rights entitlement', class: 'rights_entitlement', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'SG', description: 'State Development Loans', class: 'state_development_loan', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'TB', description: 'Treasury Bills', class: 'treasury_bill', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'BO', description: 'Buyback of equity shares through stock exchange route', class: 'buyback', equityUniverse: false, preferredForStandardStockQuote: false },
  { seriesPattern: 'BL^', description: 'Block deals', class: 'block_deal', equityUniverse: false, preferredForStandardStockQuote: false }
];

function classifyNseSeries(series) {
  const s = String(series || '').trim().toUpperCase();
  if (s === 'EQ') return NSE_SERIES_LEGEND[0];
  if (s === 'BE' || s === 'BZ') return NSE_SERIES_LEGEND[1];
  if (s === 'SM') return NSE_SERIES_LEGEND[2];
  if (s === 'ST' || s === 'SZ') return NSE_SERIES_LEGEND[3];
  if (/^E[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[4];
  if (/^X[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[5];
  if (s === 'MF') return NSE_SERIES_LEGEND[6];
  if (s === 'ME') return NSE_SERIES_LEGEND[7];
  if (/^P[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[8];
  if (/^Q[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[9];
  if (/^[NYZAB][0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[10];
  if (/^D[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[11];
  if (/^W[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[12];
  if (s === 'IV') return NSE_SERIES_LEGEND[13];
  if (s === 'GB') return NSE_SERIES_LEGEND[14];
  if (s === 'GS') return NSE_SERIES_LEGEND[15];
  if (s === 'RR' || s === 'RT') return NSE_SERIES_LEGEND[16];
  if (s === 'SG') return NSE_SERIES_LEGEND[18];
  if (s === 'TB') return NSE_SERIES_LEGEND[19];
  if (s === 'BO') return NSE_SERIES_LEGEND[20];
  if (s.startsWith('BL')) return NSE_SERIES_LEGEND[21];
  return { seriesPattern: s || 'UNKNOWN', description: 'Unmapped NSE series code', class: 'unknown', equityUniverse: false, preferredForStandardStockQuote: false };
}

function parseNseCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];

  return rows.slice(1).map(cols => {
    const [symbol, companyName, series, dateOfListing, paidUpValue, marketLot, isin, faceValue] = cols;
    const cleanSym = String(symbol || '').trim().toUpperCase();
    const cleanSeries = String(series || '').trim().toUpperCase();
    const legendInfo = classifyNseSeries(cleanSeries);
    const paidUp = Number(String(paidUpValue || '').replace(/,/g, '').trim());
    const mLot = Number(String(marketLot || '').replace(/,/g, '').trim());
    const fValue = Number(String(faceValue || '').replace(/,/g, '').trim());

    return {
      symbol: cleanSym,
      companyName: String(companyName || '').trim(),
      series: cleanSeries,
      seriesDescription: legendInfo.description,
      seriesClass: legendInfo.class,
      settlementType: legendInfo.settlementType || 'Regular',
      dateOfListing: String(dateOfListing || '').trim(),
      paidUpValue: Number.isFinite(paidUp) ? paidUp : null,
      marketLot: Number.isFinite(mLot) ? mLot : 1,
      isin: String(isin || '').trim(),
      faceValue: Number.isFinite(fValue) ? fValue : null,
      equityEligible: ['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(cleanSeries),
      preferredForStockResearch: cleanSeries === 'EQ'
    };
  }).filter(r => r.symbol && r.isin);
}

async function run() {
  console.log('Reading EQUITY_L.csv...');
  const csvRaw = await readFile(CSV_PATH, 'utf8');
  const symbols = parseNseCsv(csvRaw);

  console.log('Reading nse-index-catalog.json...');
  const indexCatalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));

  const referencePayload = {
    schemaVersion: '1.2.0',
    title: 'NSE Symbols & Indices Unified Reference Catalog',
    generatedAt: new Date().toISOString(),
    totalSymbols: symbols.length,
    indexCatalog,
    seriesLegend: NSE_SERIES_LEGEND,
    symbols
  };

  console.log(`Writing reference JSON to ${OUT_JSON_PATH}...`);
  await writeFile(OUT_JSON_PATH, JSON.stringify(referencePayload, null, 2), 'utf8');

  const metaPayload = {
    sourceCsv: 'data/EQUITY_L.csv',
    sourceIndexCatalog: 'data/nse-index-catalog.json',
    totalSymbols: symbols.length,
    eqCount: symbols.filter(s => s.preferredForStockResearch).length,
    seriesDistribution: Object.fromEntries(
      Object.entries(symbols.reduce((acc, s) => { acc[s.series] = (acc[s.series] || 0) + 1; return acc; }, {}))
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    generatedAt: new Date().toISOString()
  };

  console.log(`Writing metadata JSON to ${OUT_META_PATH}...`);
  await writeFile(OUT_META_PATH, JSON.stringify(metaPayload, null, 2), 'utf8');

  console.log(`✅ Successfully generated NSE symbols reference with ${symbols.length} equities.`);
}

run().catch(err => {
  console.error('Fatal error generating symbols reference:', err);
  process.exit(1);
});
