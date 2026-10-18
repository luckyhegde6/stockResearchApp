import assert from 'node:assert/strict';
import { optionalPairCheck, parseTestSuitePaths, summarizeHealthChecks } from './local-health-check.js';

assert.equal(summarizeHealthChecks([{name:'a',status:'pass',detail:'ok'}]).status,'pass');
assert.equal(optionalPairCheck('optional',false,false).status,'warn');
assert.equal(optionalPairCheck('optional',true,true).status,'pass');
assert.equal(optionalPairCheck('optional',true,false).status,'fail');
assert.match(optionalPairCheck('LLM',true,false,'LLM_ENDPOINT','LLM_API_KEY or OPENROUTER_API_KEY').detail,/LLM_ENDPOINT is set but LLM_API_KEY or OPENROUTER_API_KEY is missing/);
assert.match(optionalPairCheck('Sheets',false,true,'GOOGLE_SHEETS_WEBHOOK_URL','GOOGLE_SHEETS_WEBHOOK_TOKEN').detail,/GOOGLE_SHEETS_WEBHOOK_TOKEN is set but GOOGLE_SHEETS_WEBHOOK_URL is missing/);
assert.equal(summarizeHealthChecks([{name:'optional',status:'warn',detail:'not set'}]).status,'warn');
assert.equal(summarizeHealthChecks([{name:'optional',status:'warn',detail:'not set'},{name:'runtime',status:'fail',detail:'missing'}]).status,'fail');
assert.deepEqual(parseTestSuitePaths("const tests = [\n  'scripts/test-one.ts',\n  'scripts/test-two.ts',\n  'scripts/test-two.ts',\n  'other.ts',\n];"),['scripts/test-one.ts','scripts/test-two.ts']);
console.log('Local health check tests passed.');
