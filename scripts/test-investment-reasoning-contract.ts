import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const prompt=await readFile(path.join(root,'skills','stock-analysis','ANALYSIS_PROMPT.md'),'utf8');
const skill=await readFile(path.join(root,'skills','stock-analysis','SKILL.md'),'utf8');
const schema=await readFile(path.join(root,'skills','stock-analysis','JSON_SCHEMA.md'),'utf8');
const required=[
  'EVIDENCE AUDIT','BUSINESS QUALITY','FINANCIAL QUALITY','MANAGEMENT DNA','VALUATION REALITY',
  'TECHNICAL STRUCTURE','OWNERSHIP','CATALYSTS','THESIS-BREAKING RISKS','PEER / ALTERNATIVE TEST',
  'CONTRARIAN TEST','SCENARIOS','DECISION','FINAL JSON'
];
const missing=required.filter(x=>!prompt.includes(x));
const rules=['do not browse','do not invent','source facts','calculated metrics','analyst judgment','Chartink','BSE is excluded','confidence','news sentiment'];
const missingSkill=rules.filter(x=>!skill.toLowerCase().includes(x.toLowerCase()));
const schemaKeys=['recommendation','scores','fundamentals','management','valuation','technical','shareholding','risks','catalysts','scenarios','contrarian_test','entry_zones','portfolio_action'];
const missingSchema=schemaKeys.filter(x=>!schema.includes(`"${x}"`));
console.log(JSON.stringify({ok:!missing.length&&!missingSkill.length&&!missingSchema.length,missingPromptSections:missing,missingSkillRules:missingSkill,missingSchemaKeys:missingSchema},null,2));
if(missing.length||missingSkill.length||missingSchema.length) process.exit(1);
