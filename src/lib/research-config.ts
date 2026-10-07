import 'dotenv/config';

function envBool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export const RESEARCH_CONFIG = Object.freeze({
  chartinkEnabled: envBool('RESEARCH_INCLUDE_CHARTINK', false),
  newsGoogleEnabled: envBool('NEWS_ENABLE_GOOGLE_RSS', true),
  newsTvMaxPages: Number(process.env.NEWS_TV_MAX_PAGES || 3),
  debugConsoleEnabled: !/^(0|false|no|off)$/i.test(process.env.DEBUG_CONSOLE ?? 'true'),
  defaultExchange: 'NSE' as const,
  tradingViewUiSurfaces: String(process.env.TRADINGVIEW_UI_SURFACES || 'forecast,news,documents,seasonals,community').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  productVersion: '1.49.5',
});

export function featureSummary() {
  return {
    chartink: {
      enabled: RESEARCH_CONFIG.chartinkEnabled,
      env: 'RESEARCH_INCLUDE_CHARTINK',
      scope: 'individual-stock-research',
    },
    news: {
      googleRss: RESEARCH_CONFIG.newsGoogleEnabled,
      tradingViewNewsFlow: true,
      method: 'headline_metadata_plus_deterministic_sentiment'
    },
    tradingViewUi: {
      surfaces: RESEARCH_CONFIG.tradingViewUiSurfaces,
      method: 'playwright_more_menu_screenshots'
    },
    sources: {
      required: ['NSE', 'Screener', 'Tijori', 'TradingView'],
      supplementary: ['News'],
      optional: ['Chartink'],
      excluded: ['BSE'],
    },
  };
}

export function normalizeSymbolInput(input: string): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const q = u.searchParams.get('symbol');
      if (q) s = q;
      else {
        const parts = u.pathname.split('/').filter(Boolean);
        s = parts.at(-1) || s;
      }
    }
  } catch {}
  s = s.replace(/^NSE[:/]/i, '').replace(/\.NS$/i, '').trim();
  return s.toUpperCase();
}
