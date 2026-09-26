// The model behind Ask 3C: any OpenAI-compatible Chat Completions endpoint,
// chosen by env only. Defaults are DeepSeek (https://api-docs.deepseek.com):
//   ASK_API_KEY   the provider key (required unless the E2E sandbox stub runs)
//   ASK_BASE_URL  default https://api.deepseek.com  (POST {base}/chat/completions)
//   ASK_MODEL     default deepseek-flash (DeepSeek-V4.1-Flash, reads images)

export const DEFAULT_ASK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_ASK_MODEL = 'deepseek-flash';
export const ASK_TIMEOUT_MS = 30_000;
/** The answer is a few lines; thinking tokens count here too, so this leaves room for both. */
const MAX_ANSWER_TOKENS = 6000;

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

/**
 * One answer. With `selfCheck`, the draft is sent back in the same conversation
 * with that instruction (thinking off, so it rides the cached prompt and adds
 * ~1.5s) and the model returns a cleaned copy: in an A/B on 21 cases that kept
 * slipping (10/1), this cut answers with an invented claim from 5 of 21 to 1.
 * Any failure of the check keeps the draft.
 */
export async function callAskModel(
  config: AskProviderConfig,
  messages: AskMessage[],
  timeoutMs = ASK_TIMEOUT_MS,
  selfCheck?: string
): Promise<{ answer: string; usage: AskUsage; draft?: string }> {
  const started = Date.now();
  const draft = await draftAnswer(config, messages, timeoutMs);
  const left = timeoutMs - (Date.now() - started);
  if (!selfCheck || left < 4_000) return draft;
  try {
    const checked = await requestAnswer(
      config,
      [...messages, { role: 'assistant', content: draft.answer }, { role: 'user', content: selfCheck }],
      Math.min(left, 12_000),
      false
    );
    // A cut-off, a comment about the check, or a gutted reply keeps the draft.
    if (checked.truncated || /^(looks|no changes|the reply|this reply|checked|all good)/i.test(checked.answer) || checked.answer.length < draft.answer.length * 0.4) {
      return draft;
    }
    const u = draft.usage;
    const c = checked.usage;
    return {
      answer: checked.answer,
      ...(checked.answer !== draft.answer ? { draft: draft.answer } : {}),
      usage: {
        promptTokens: u.promptTokens + c.promptTokens,
        cachedTokens: u.cachedTokens + c.cachedTokens,
        completionTokens: u.completionTokens + c.completionTokens,
      },
    };
  } catch {
    return draft;
  }
}

/**
 * The draft. Field tests saw thinking mode occasionally return an empty
 * answer, or run out of tokens mid-sentence; either is retried once with
 * thinking off. A cut-off answer is still returned if that retry fails, since a
 * trimmed reply beats an error at the door.
 * Throws AskProviderError on a timeout, a non-2xx, or an empty answer.
 */
async function draftAnswer(
  config: AskProviderConfig,
  messages: AskMessage[],
  timeoutMs: number
): Promise<{ answer: string; usage: AskUsage }> {
  const started = Date.now();
  let cutOff: { answer: string; usage: AskUsage } | null = null;
  try {
    const first = await requestAnswer(config, messages, timeoutMs, true);
    if (!first.truncated) return first;
    cutOff = first;
  } catch (error) {
    if (!(error instanceof AskProviderError) || error.kind !== 'bad_response') throw error;
  }
  const left = timeoutMs - (Date.now() - started);
  if (left < 5_000) {
    if (cutOff) return cutOff;
    throw new AskProviderError('bad_response');
  }
  try {
    const retry = await requestAnswer(config, messages, left, false);
    return retry.truncated && cutOff ? cutOff : retry;
  } catch (error) {
    if (cutOff) return cutOff;
    throw error;
  }
}

async function requestAnswer(
  config: AskProviderConfig,
  messages: AskMessage[],
  timeoutMs: number,
  think: boolean
): Promise<{ answer: string; usage: AskUsage; truncated: boolean }> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: MAX_ANSWER_TOKENS,
    stream: false,
  };
  // Field tests (9/25): with thinking the model stopped guessing where the
  // notes are silent, did the Central/Eastern hours math and led with the
  // decision; median answer 2.8s vs 2.4s. A later A/B on 27 flaky cases x3
  // (10/1) had 'high' invent less than 'low' (13 vs 17 of 81) at the same speed and length. Only DeepSeek knows these fields, so
  // another provider behind ASK_BASE_URL never sees them.
  if (isDeepSeek(config.baseUrl)) {
    body.thinking = { type: think ? 'enabled' : 'disabled' };
    if (think) body.reasoning_effort = 'high';
    else body.temperature = 0.5;
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
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
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
    truncated: json?.choices?.[0]?.finish_reason === 'length',
    usage: {
      promptTokens: count(usage?.prompt_tokens),
      // DeepSeek names it prompt_cache_hit_tokens; OpenAI-style APIs nest it.
      cachedTokens: count(usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens),
      completionTokens: count(usage?.completion_tokens),
    },
  };
}
