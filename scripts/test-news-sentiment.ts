import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const files=['src/adapters/news-sentiment.ts','src/adapters/tradingview-symbol-snapshot.ts','src/lib/analysis-inputs.ts','src/lib/analysis-evidence-pack.ts','src/lib/prompt.ts','src/schema.ts'];
const text=(await Promise.all(files.map(f=>readFile(path.join(root,f),'utf8')))).join('\n');
const checks={
  tradingViewNewsFlow:text.includes('news-mediator.tradingview.com/public/news-flow/v2/news'),
  googleNewsRss:text.includes('news.google.com/rss/search'),
  nseAnnouncements:text.includes("source:'NSE'"),
  deterministicSentiment:text.includes('headline_lexicon_with_recency_weighting'),
  tradingViewSnapshot:text.includes('scanner.tradingview.com/symbol'),
  analysisPromptUsesNews:text.includes('news-sentiment.json') && text.includes('NEWS & MARKET SENTIMENT'),
  schemaHasNewsSentiment:text.includes('news_sentiment')
};
console.log(JSON.stringify({ok:Object.values(checks).every(Boolean),checks},null,2));
if(!Object.values(checks).every(Boolean)) process.exit(1);
