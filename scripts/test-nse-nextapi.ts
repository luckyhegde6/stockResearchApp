import { normalizeMetaData, normalizeSymbolChartData, normalizeSymbolData, normalizeSymbolName, normalizeYearwise, resolveQuoteIdentifier } from '../src/lib/nse-nextapi-normalizer.js';
import { nseEndpoints } from '../src/lib/nse-api-client.js';

const symbol = 'ITC';
const symbolData = {
  equityResponse: [{
    orderBook: { lastPrice: 255.5 },
    metaData: {
      identifier: 'ITCEQN', companyName: 'ITC Limited', isinCode: 'INE154A01025', symbol: 'ITC', series: 'EQ', marketType: 'N',
      open: 266, dayHigh: 266.55, dayLow: 255.5, previousClose: 266, averagePrice: 262.3, change: -10.5, closePrice: 255.5, pChange: -3.95,
    },
    tradeInfo: { lastPrice: 255.5, totalTradedVolume: 24575845, totalTradedValue: 6446244143.5, issuedSize: 12529782032, ffmc: 2456108472874.3, deliveryToTradedQuantity: 76.62, deliveryquantity: 18829561, totalMarketCap: 3201359309176 },
    priceInfo: { yearHigh: 427, yearLow: 255.5, yearHightDt: '04-Sep-2025 00:00:00', yearLowDt: '31-Aug-2026 15:59:59', tickSize: 0.05, priceBand: '239.40-292.60' },
    secInfo: { pdSectorPe: '16.56', pdSymbolPe: '16.51', secStatus: 'Listed', basicIndustry: 'Diversified FMCG', index: 'Nifty 50', macro: 'Fast Moving Consumer Goods', sector: 'Fast Moving Consumer Goods', industryInfo: 'Diversified FMCG', indexList: ['NIFTY 50','NIFTY 100','NIFTY 500'] },
    lastUpdateTime: '31-Aug-2026 16:00:00'
  }]
};
const meta = { symbol: 'ITC', activeSeries: ['EQ','T0'], companyName: 'ITC Limited', isin: 'INE154A01025', marketType: 'N', parentSymbol: 'ITC', isSuspended: 'false' };
const yearwise = [{ yesterday_chng_per: -29.78, one_week_chng_per: -5.27, one_year_chng_per: -37.64, five_year_chng_per: 20.92, index_one_year_chng_per: -1.42, index_five_year_chng_per: 40.56, one_week_date: '24-AUG-26', index_one_week_date: '24-AUG-26', index_name: 'NIFTY 50' }];
const chart = { identifier: 'ITCEQN', name: 'ITC', grapthData: [[1788166859000,266,'PO','0','0'],[1788166919000,267.5,'PO','1.5','0.56'],[1788166979000,267.5,'PO','1.5','0.56']] };

const q = normalizeSymbolData(symbolData, symbol);
const id = resolveQuoteIdentifier(q, symbol);
const sy = normalizeSymbolName({ symbol:'ITC', name:'ITC Limited', identifier:'ITCEQN', isin:'INE154A01025' }, symbol);
const md = normalizeMetaData(meta, symbol);
const yw = normalizeYearwise(yearwise);
const ch = normalizeSymbolChartData(chart);
const endpointChecks = {
  symbolName: nseEndpoints.symbolName('ITC').includes('functionName=getSymbolName&symbol=ITC'),
  metadata: nseEndpoints.metadata('ITC').includes('functionName=getMetaData&symbol=ITC'),
  symbolData: nseEndpoints.quoteNextApi('ITC').includes('functionName=getSymbolData&marketType=N&series=EQ&symbol=ITC'),
  yearwise: nseEndpoints.yearwise('ITCEQN').includes('functionName=getYearwiseData&symbol=ITCEQN'),
  chart1d: nseEndpoints.symbolChart('ITCEQN').includes('functionName=getSymbolChartData&symbol=ITCEQN&days=1D')
};
const ok = Object.values(endpointChecks).every(Boolean) && q.lastPrice === 255.5 && q.totalTradedVolume === 24575845 && q.totalMarketCap === 3201359309176 && q.indexList.includes('NIFTY 50') && id === 'ITCEQN' && sy.companyName === 'ITC Limited' && md.activeSeries.includes('EQ') && yw.some(x => x.period === 'one_year' && x.stockChangePct === -37.64) && ch.length === 3 && ch[1].price === 267.5;
console.log(JSON.stringify({ ok, endpointChecks, quote: { lastPrice:q.lastPrice, volume:q.totalTradedVolume, marketCap:q.totalMarketCap, sector:q.sector, indexList:q.indexList }, identifier:id, symbolName:sy, metadata:md, yearwise:yw.slice(0,2), chartPoints:ch.length }, null, 2));
process.exitCode = ok ? 0 : 1;
