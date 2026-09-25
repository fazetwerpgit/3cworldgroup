// The model behind Ask 3C: any OpenAI-compatible Chat Completions endpoint,
// chosen by env only. Defaults are DeepSeek (https://api-docs.deepseek.com):
//   ASK_API_KEY   the provider key (required unless the E2E sandbox stub runs)
//   ASK_BASE_URL  default https://api.deepseek.com  (POST {base}/chat/completions)
//   ASK_MODEL     default deepseek-flash (DeepSeek-V4.1-Flash, reads images)

export const DEFAULT_ASK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_ASK_MODEL = 'deepseek-flash';
export const ASK_TIMEOUT_MS = 30_000;
/** The answer is a few lines; thinking tokens count here too, so this leaves room for both. */
const MAX_ANSWER_TOKENS = 3000;

export type AskContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AskMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AskContentPart[];
}

export interface AskUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

export interface AskProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class AskProviderError extends Error {
  constructor(
    readonly kind: 'timeout' | 'http' | 'bad_response' | 'network',
    readonly status?: number
  ) {
    super(`ask provider ${kind}${status ? ` ${status}` : ''}`);
  }
}

export function askProviderConfig(): AskProviderConfig {
  return {
    apiKey: process.env.ASK_API_KEY?.trim() ?? '',
    baseUrl: (process.env.ASK_BASE_URL?.trim() || DEFAULT_ASK_BASE_URL).replace(/\/+$/, ''),
    model: process.env.ASK_MODEL?.trim() || DEFAULT_ASK_MODEL,
  };
}

function isDeepSeek(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('deepseek.com');
  } catch {
    return false;
  }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** One non-streamed completion. Throws AskProviderError on a timeout, a non-2xx, or an empty answer. */
export async function callAskModel(
  config: AskProviderConfig,
  messages: AskMessage[],
  timeoutMs = ASK_TIMEOUT_MS
): Promise<{ answer: string; usage: AskUsage }> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: MAX_ANSWER_TOKENS,
    stream: false,
  };
  // Field tests (9/25): with short thinking the model stopped guessing where the
  // notes are silent, did the Central/Eastern hours math and led with the
  // decision; median answer 2.8s vs 2.4s. Only DeepSeek knows these fields, so
  // another provider behind ASK_BASE_URL never sees them.
  if (isDeepSeek(config.baseUrl)) {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = 'low';
  } else {
    body.temperature = 0.5;
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new AskProviderError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
  if (!res.ok) throw new AskProviderError('http', res.status);

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      prompt_cache_hit_tokens?: unknown;
      prompt_tokens_details?: { cached_tokens?: unknown };
    };
  } | null;
  const answer = json?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new AskProviderError('bad_response');
  const usage = json?.usage;
  return {
    answer: answer.trim(),
    usage: {
      promptTokens: count(usage?.prompt_tokens),
      // DeepSeek names it prompt_cache_hit_tokens; OpenAI-style APIs nest it.
      cachedTokens: count(usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens),
      completionTokens: count(usage?.completion_tokens),
    },
  };
}
