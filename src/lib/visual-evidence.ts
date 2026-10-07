import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

const IMAGE_RE=/\.(png|jpe?g|webp)$/i;
async function walk(dir:string):Promise<string[]>{const out:string[]=[];try{for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()) out.push(...await walk(p)); else if(IMAGE_RE.test(e.name)) out.push(p);}}catch{}return out;}
export async function writeVisualEvidence(researchDir:string){
  const screenshots=await walk(path.join(researchDir,'screenshots'));
  const entries=screenshots.map(file=>{
  const rel=path.relative(researchDir,file).replaceAll(path.sep,'/');
  const base=path.basename(file).toLowerCase();
  const source=base.startsWith('tradingview-') ? 'TradingView' : base.startsWith('chartink-') ? 'Chartink' : 'unknown';
  const uiSurface=/^tradingview-(forecast|news|documents|seasonals|community|financials|options|etfs|bonds)\.png$/i.test(path.basename(file));
  return {file:rel,type:uiSurface?'tradingview_ui_surface':'visual_evidence',source,extraction:'not_textually_extracted',llmReady:true,note:uiSurface?'TradingView UI surface screenshot retained for later visual/context analysis.':'Image retained for later multimodal/visual analysis. MarkItDown text conversion is not assumed for screenshots.'};
});
  const out=path.join(researchDir,'markdown','VISUAL_EVIDENCE.md');
  const md=['# Visual Evidence','', 'Screenshots are preserved as primary visual artifacts. Numeric values must not be inferred from screenshots when deterministic source data exists.','',...entries.map(e=>`- ${e.file}`)].join('\n');
  await writeFile(out,md,'utf8');
  await writeFile(path.join(researchDir,'visual-evidence.json'),JSON.stringify({schema_version:'1.0',ticker:path.basename(researchDir),generatedAt:new Date().toISOString(),screenshots:entries,deterministic:true,llmUsed:false},null,2),'utf8');
  return {markdownPath:out,jsonPath:path.join(researchDir,'visual-evidence.json'),count:entries.length};
}
