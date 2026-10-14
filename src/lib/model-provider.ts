export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelGenerationRequest {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelGenerationResponse {
  content: string;
  provider: string;
  model: string;
  requestId?: string;
}

export interface ModelProvider {
  readonly id: string;
  generate(request: ModelGenerationRequest, options?: { signal?: AbortSignal }): Promise<ModelGenerationResponse>;
}

export interface OpenAICompatibleProviderOptions {
  endpoint: string;
  apiKey: string;
  providerId?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAICompatibleResponse {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Thin adapter for OpenAI-compatible chat-completions endpoints.
 * Provider-specific transport and response parsing stay outside orchestration.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    if (!options.endpoint.trim()) throw new Error('Model provider endpoint must not be empty');
    if (!options.apiKey.trim()) throw new Error('Model provider API key must not be empty');
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.id = options.providerId?.trim() || 'openai-compatible';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: ModelGenerationRequest, options: { signal?: AbortSignal } = {}): Promise<ModelGenerationResponse> {
    if (!request.model.trim()) throw new Error('Model name must not be empty');
    if (request.messages.length === 0) throw new Error('At least one model message is required');

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.15,
    };
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      // Avoid throwing raw provider bodies: they may contain sensitive server details.
      throw new Error(`Model provider ${this.id} returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }

    let data: OpenAICompatibleResponse;
    try {
      data = JSON.parse(responseText) as OpenAICompatibleResponse;
    } catch {
      throw new Error(`Model provider ${this.id} returned malformed JSON`);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(`Model provider ${this.id} response did not contain choices[0].message.content`);
    }

    return {
      content,
      provider: this.id,
      model: typeof data.model === 'string' ? data.model : request.model,
      ...(typeof data.id === 'string' ? { requestId: data.id } : {}),
    };
  }
}

export function createModelProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { provider: ModelProvider; model: string; timeoutMs: number } {
  const endpoint = env.LLM_ENDPOINT;
  const apiKey = env.LLM_API_KEY;
  const model = env.LLM_MODEL;
  if (!endpoint || !apiKey || !model) {
    throw new Error(
      'LLM analysis is not configured. Set LLM_ENDPOINT, LLM_API_KEY and LLM_MODEL. The research artifacts and analysis-prompt.txt were still generated.',
    );
  }
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 120000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('LLM_TIMEOUT_MS must be a positive finite number');
  }
  return {
    provider: new OpenAICompatibleProvider({
      endpoint,
      apiKey,
      providerId: env.LLM_PROVIDER_ID || 'openai-compatible',
      fetchImpl,
    }),
    model,
    timeoutMs,
  };
}
