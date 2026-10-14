import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { OpenAICompatibleProvider, createModelProviderFromEnv } from '../src/lib/model-provider.js';
import { runLlmAnalysis } from '../src/lib/llm.js';

const calls: Array<{ url: string; init?: RequestInit }> = [];
const mockFetch: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), init });
  return new Response(JSON.stringify({
    id: 'request-test-1',
    model: 'fixture-model',
    choices: [{ message: { content: '{"ok":true}' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const provider = new OpenAICompatibleProvider({
  endpoint: 'https://provider.example/v1/chat/completions',
  apiKey: 'test-secret-never-log',
  providerId: 'fixture',
  fetchImpl: mockFetch,
});
const response = await provider.generate({
  model: 'fixture-model',
  messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'user' }],
  temperature: 0.15,
});
assert.equal(response.content, '{"ok":true}');
assert.equal(response.provider, 'fixture');
assert.equal(response.model, 'fixture-model');
assert.equal(response.requestId, 'request-test-1');
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://provider.example/v1/chat/completions');
assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer test-secret-never-log');
assert.equal(JSON.parse(String(calls[0].init?.body)).messages.length, 2);

const config = createModelProviderFromEnv({
  LLM_ENDPOINT: 'https://mock.example/chat',
  LLM_API_KEY: 'mock-key',
  LLM_MODEL: 'mock-model',
  LLM_PROVIDER_ID: 'mock-provider',
  LLM_TIMEOUT_MS: '3000',
}, mockFetch);
assert.equal(config.provider.id, 'mock-provider');
assert.equal(config.model, 'mock-model');
assert.equal(config.timeoutMs, 3000);

assert.throws(() => createModelProviderFromEnv({ LLM_ENDPOINT: 'url', LLM_API_KEY: '', LLM_MODEL: 'model' }), /LLM_ENDPOINT, LLM_API_KEY and LLM_MODEL/);
assert.throws(() => createModelProviderFromEnv({ LLM_ENDPOINT: 'url', LLM_API_KEY: 'key', LLM_MODEL: 'model', LLM_TIMEOUT_MS: '0' }), /positive finite number/);
await assert.rejects(
  () => provider.generate({ model: '', messages: [{ role: 'user', content: 'x' }] }),
  /Model name must not be empty/,
);

const noContentProvider = new OpenAICompatibleProvider({
  endpoint: 'https://provider.example/chat',
  apiKey: 'test',
  fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 })) as typeof fetch,
});
await assert.rejects(
  () => noContentProvider.generate({ model: 'fixture', messages: [{ role: 'user', content: 'x' }] }),
  /did not contain choices/,
);
const malformedProvider = new OpenAICompatibleProvider({
  endpoint: 'https://provider.example/chat',
  apiKey: 'test',
  fetchImpl: (async () => new Response('not-json', { status: 200 })) as typeof fetch,
});
await assert.rejects(
  () => malformedProvider.generate({ model: 'fixture', messages: [{ role: 'user', content: 'x' }] }),
  /malformed JSON/,
);
const failingProvider = new OpenAICompatibleProvider({
  endpoint: 'https://provider.example/chat',
  apiKey: 'test',
  fetchImpl: (async () => new Response('internal details', { status: 503 })) as typeof fetch,
});
await assert.rejects(
  () => failingProvider.generate({ model: 'fixture', messages: [{ role: 'user', content: 'x' }] }),
  /HTTP 503/,
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'stockresearch-model-provider-'));
try {
  const outputPath = path.join(tempDir, 'analysis.json');
  const written = await runLlmAnalysis('system', 'user', outputPath, {
    provider,
    model: 'fixture-model',
    timeoutMs: 1000,
  });
  assert.equal(written, '{"ok":true}');
  assert.equal(await readFile(outputPath, 'utf8'), '{"ok":true}');
  await assert.rejects(
    () => runLlmAnalysis('system', 'user', path.join(tempDir, 'invalid.json'), {
      provider: {
        id: 'invalid-json-provider',
        generate: async () => ({ content: 'not-json', provider: 'invalid-json-provider', model: 'x' }),
      },
      model: 'x',
      timeoutMs: 1000,
    }),
    /JSON/,
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('model provider tests passed');
