import 'dotenv/config';
import { chromium } from 'playwright';

async function main() {
  console.log(`Source doctor`);
  console.log(`node=${process.version}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [name, url] of [
    ['NSE', 'https://www.nseindia.com/'],
    ['Screener', 'https://www.screener.in/'],
    ['Tijori', 'https://www.tijorifinance.com/'],
    ['TradingView', 'https://www.tradingview.com/'],
    ['BSE', 'https://www.bseindia.com/'],
  ] as const) {
    const started = Date.now();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      console.log(`✓ ${name} status=${response?.status() ?? 'n/a'} url=${page.url()} ms=${Date.now() - started}`);
    } catch (e: any) {
      console.log(`! ${name} error=${e?.message || String(e)} ms=${Date.now() - started}`);
    }
  }
  await browser.close();
}
main().catch(e => { console.error(e?.stack || e); process.exitCode = 1; });
