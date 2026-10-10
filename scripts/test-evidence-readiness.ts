import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildAnalysisReadiness } from '../src/lib/analysis-readiness.js';

const ticker=(process.argv[2]??'ITC').toUpperCase();
const dir=path.join(process.cwd(),'fixtures','research',ticker);
const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
const report=await buildAnalysisReadiness(dir,manifest);
console.log(JSON.stringify({ok:report.ready,ticker,blockingReasons:report.blockingReasons,missingFiles:report.missingFiles,missingFilesByGroup:report.missingFilesByGroup,qualityStatus:report.qualityStatus,coreCompleteness:report.coreCompleteness,actionableWarnings:report.actionableWarnings},null,2));
process.exitCode = report?.deterministic === true && report?.ready === true ? 0 : 1;
