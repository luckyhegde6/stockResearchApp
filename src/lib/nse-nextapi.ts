import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { nseFetchJson } from './nse-api-client.js';
import { NSE_BASE, NSE_NEXTAPI_SPECS } from './nse-nextapi-registry.js';

function dateDDMMYYYY(d:Date){return `${String(d.getUTCDate()).padStart(2,'0')}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${d.getUTCFullYear()}`;}
function addDays(d:Date,n:number){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;}

export async function acquireNseNextApi(argvSymbol:string, root:string) {
  const symbol=argvSymbol.toUpperCase(); const session=`nse-nextapi-${symbol}-${Date.now()}`;
  const outRoot=path.join(root,'raw','nse-api','nextapi'); await mkdir(outRoot,{recursive:true});
  const ref=`${NSE_BASE}/get-quote/equity/${encodeURIComponent(symbol)}`;
  const today=new Date(); const range={fromDate:dateDDMMYYYY(addDays(today,-184)),toDate:dateDDMMYYYY(today)};
  const report:any={schema_version:'1.0',ticker:symbol,retrievedAt:new Date().toISOString(),range,endpointCount:NSE_NEXTAPI_SPECS.length,endpoints:[],deterministic:true,llmUsed:false};
  let identifier=`${symbol}EQN`;
  for(const spec of NSE_NEXTAPI_SPECS){
    if(spec.requiresIdentifier && spec.id==='yearwise') { }
    let endpoint=spec.buildPath(spec.id==='announcements' ? symbol : (spec.requiresIdentifier ? identifier : symbol), spec.id==='announcements'?range:undefined);
    if(spec.id==='peer-comparison') endpoint=spec.buildPath(symbol,{quarter:''});
    try{
      const data=await nseFetchJson(endpoint,{cwd:process.cwd(),session,referer:ref});
      const dir=path.join(outRoot,spec.family); await mkdir(dir,{recursive:true});
      const file=path.join(dir,spec.filename); await writeFile(file,JSON.stringify(data,null,2),'utf8');
      if(spec.id==='symbol-data') { const id=data?.equityResponse?.[0]?.metaData?.identifier; if(id) identifier=String(id); }
      report.endpoints.push({id:spec.id,functionName:spec.functionName,url:`${NSE_BASE}${endpoint}`,path:file,status:'ok'});
    }catch(e:any){ report.endpoints.push({id:spec.id,functionName:spec.functionName,url:`${NSE_BASE}${endpoint}`,status:'error',error:e?.message||String(e)}); }
  }
  const reportPath=path.join(outRoot,'acquisition-report.json');
  await writeFile(reportPath,JSON.stringify(report,null,2),'utf8');

  // Keep a lightweight datewise snapshot index without duplicating raw payloads.
  // The research/<SYMBOL>/ directory may be wiped and rebuilt, while this index
  // records when the deterministic NextApi bundle was captured.
  const snapshotDate = new Date().toISOString().slice(0,10);
  const snapshotDir = path.join(root,'snapshots',snapshotDate);
  await mkdir(snapshotDir,{recursive:true});
  const snapshotIndex = {
    schema_version:'1.0',
    ticker:symbol,
    snapshotDate,
    retrievedAt:report.retrievedAt,
    range:report.range,
    endpointCount:report.endpointCount,
    endpoints:report.endpoints.map((e:any)=>({id:e.id,status:e.status,path:e.path??null,url:e.url,error:e.error??null})),
    rawRoot:path.relative(root,outRoot),
    deterministic:true,
    llmUsed:false
  };
  await writeFile(path.join(snapshotDir,'nse-api-index.json'),JSON.stringify(snapshotIndex,null,2),'utf8');

  const indexPath = path.join(root,'nse-api-index.json');
  await writeFile(indexPath,JSON.stringify({schema_version:'1.0',ticker:symbol,latestSnapshotDate:snapshotDate,latestReport:path.relative(root,reportPath),snapshotsPath:'snapshots',deterministic:true,llmUsed:false},null,2),'utf8');

  return {...report,snapshotIndex:path.join(snapshotDir,'nse-api-index.json'),latestIndex:indexPath};
}

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`){const symbol=process.argv[2];if(!symbol)throw new Error('Usage: npm run nse:nextapi -- ITC'); acquireNseNextApi(symbol,path.join(process.cwd(), 'research', symbol.toUpperCase())).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
