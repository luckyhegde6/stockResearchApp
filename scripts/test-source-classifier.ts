import { classifySource, classifyProvider } from '../src/lib/source-classifier.js';

const cases = [
  ['NSE','core'],['Screener','core'],['Tijori','core'],['TradingView','core'],['News','supplementary'],
  ['Chartink','optional'],['BSE','excluded']
] as const;
const results = cases.map(([v,e])=>({value:v,expected:e,actual:classifySource(v),ok:classifySource(v)===e}));
const providerResults = [
  ['NSE India API','core'],['Screener.in','core'],['Tijori Finance','core'],
  ['TradingView','core'],['TradingView News Flow','supplementary'],['Google News RSS','supplementary'],['Chartink','optional'],['BSE India','excluded']
].map(([v,e])=>({value:v,expected:e,actual:classifyProvider(v),ok:classifyProvider(v)===e}));
const ok=[...results,...providerResults].every(x=>x.ok);
console.log(JSON.stringify({ok,sourceCases:results,providerCases:providerResults},null,2));
process.exitCode=ok?0:1;
