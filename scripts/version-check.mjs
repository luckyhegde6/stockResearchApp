import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url),'utf8'));
const ok=p.version==='1.50.0';
console.log(JSON.stringify({ok,version:p.version},null,2));
process.exitCode=ok?0:1;
