import { buildSourceHealth } from '../src/lib/source-health.js';
const manifest:any={schema_version:'1.42',ticker:'ITC',generatedAt:new Date().toISOString(),acquisitionOnly:true,sourceArtifacts:[{id:'nse-api-quote-nextapi-fallback',type:'derived_data',provider:'NSE India API',title:'fallback',retrievedAt:new Date().toISOString(),status:'ok_with_fallback'}],dataGaps:[],warnings:['NSE API quote: NSE API 403 Forbidden: https://www.nseindia.com/api/quote-equity?symbol=ITC','NSE API trade-info: NSE API 403 Forbidden: https://www.nseindia.com/api/quote-equity?symbol=ITC&section=trade_info']};
const health=buildSourceHealth(manifest);
const ok=health.sources.NSE.informationalWarnings===2 && health.sources.NSE.warnings===0 && health.sources.NSE.status==='ok_with_fallback';
console.log(JSON.stringify({ok, nse:health.sources.NSE},null,2));
if(!ok)process.exitCode=1;
