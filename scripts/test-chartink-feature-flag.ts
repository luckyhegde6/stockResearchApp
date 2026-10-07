import { RESEARCH_CONFIG } from '../src/lib/research-config.js';
console.log(JSON.stringify({
  ok: typeof RESEARCH_CONFIG.chartinkEnabled === 'boolean',
  chartinkEnabled: RESEARCH_CONFIG.chartinkEnabled,
  env: 'RESEARCH_INCLUDE_CHARTINK',
  defaultExpected: false
}, null, 2));
process.exitCode = typeof RESEARCH_CONFIG.chartinkEnabled === 'boolean' ? 0 : 1;
