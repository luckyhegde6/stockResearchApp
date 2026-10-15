import { writeText } from './fs.js';
import { createModelProviderFromEnv, type ModelProvider } from './model-provider.js';

export interface RunLlmAnalysisOptions {
  provider?: ModelProvider;
  model?: string;
  timeoutMs?: number;
}

function stripJsonFence(content: string): string {
  return content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
}

export async function runLlmAnalysis(
  systemPrompt: string,
  userPrompt: string,
  outPath: string,
  options: RunLlmAnalysisOptions = {},
) {
  const configured = options.provider ? null : createModelProviderFromEnv();
  const provider = options.provider ?? configured!.provider;
  const model = options.model ?? configured!.model;
  const timeoutMs = options.timeoutMs ?? configured?.timeoutMs ?? 120000;
  if (!model?.trim()) throw new Error('Model name must not be empty');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Model timeout must be a positive finite number');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await provider.generate({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.15,
    }, { signal: controller.signal });
    const clean = stripJsonFence(response.content);
    // Syntax validation is a transport-level guard. The authoritative analysis schema is
    // validated by the caller after this content is returned.
    JSON.parse(clean);
    await writeText(outPath, clean);
    return clean;
  } finally {
    clearTimeout(timeout);
  }
}
