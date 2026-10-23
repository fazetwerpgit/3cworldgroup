// Ask 3C eval: ~35 rep questions against the real model with the real system
// prompt (buildSystemPrompt + callAskModel), scored for key facts, invented
// facts, length (100-word cap) and latency. Real, paid DeepSeek calls; never
// part of `npm test`. No customer data: every question is made up.
//
//   ASK_EVAL_LABEL=baseline ASK_EVAL_SELFCHECK=1 ASK_EVAL_EFFORT=high \
//   [ASK_EVAL_NOTES=/path/notes.json] [ASK_EVAL_RUNS=2] [ASK_EVAL_MAX_TOKENS=6000] \
//   [ASK_EVAL_OUT=/some/dir] [ASK_EVAL_ONLY=offers,router] \
//     npx vitest run --config scripts/ask-eval.config.ts --silent=false
//
//   Compare saved runs:  ASK_EVAL_COMPARE=/dir/baseline.json,/dir/trim-on.json  (same command)
//
// The key is ASK_API_KEY from .env.local (loaded with @next/env, never
// printed). Notes come from ASK_EVAL_NOTES ([{ title, body, order }], e.g. a
// proposed edit of the notes) or, without it, a read-only read of the live
// knowledgeNotes collection. SYNTHETIC_NOTES are added either way, and each
// case sees only the notes its asker's roles may (notesForAudience, as the
// route does), with the matching line and solar rule.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'vitest';
import nextEnv from '@next/env';
import { askLineFor, hasSolarNotes, notesForAudience } from '@/lib/ask/audience';
import { sortNotes, type NoteDraft } from '@/lib/ask/notes';
import { SELF_CHECK, buildSystemPrompt } from '@/lib/ask/prompt';
import { askProviderConfig, callAskModel, type AskMessage } from '@/lib/ask/provider';
import { CASES, EVAL_FIBER_REP, SYNTHETIC_NOTES, scoreAnswer, words } from './ask-eval-score';


// ---------------------------------------------------------------------------

const env = (name: string, fallback = '') => process.env[name]?.trim() || fallback;
// Straight to stdout: vitest swallows console output of a passing test.
const out = (text: string) => process.stdout.write(`${text}\n`);

function loadKey(): void {
  // @next/env skips .env.local under NODE_ENV=test (vitest), so load as development.
  const mode = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
}

type EvalNote = Omit<NoteDraft, 'audience'> & { id: string; order: number; audience?: unknown };

async function loadNotesForEval(): Promise<EvalNote[]> {
  const file = env('ASK_EVAL_NOTES');
  if (file) {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { id?: string; title: string; body: string; order?: number; audience?: unknown }[];
    return sortNotes([
      ...raw.map((n, i) => ({ id: n.id ?? String(i), title: n.title, body: n.body, order: n.order ?? i, audience: n.audience })),
      ...SYNTHETIC_NOTES,
    ]);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const account = env('FIREBASE_SERVICE_ACCOUNT').replace(/\s+/g, '');
  if (!account) throw new Error('Set ASK_EVAL_NOTES or FIREBASE_SERVICE_ACCOUNT');
  const app = initializeApp({ credential: cert(JSON.parse(Buffer.from(account, 'base64').toString())) }, 'ask-eval');
  const snap = await getFirestore(app).collection('knowledgeNotes').get(); // read only
  return sortNotes([
    ...snap.docs.map((d) => ({ id: d.id, title: String(d.get('title') ?? ''), body: String(d.get('body') ?? ''), order: Number(d.get('order') ?? 0), audience: d.get('audience') as unknown })),
    ...SYNTHETIC_NOTES,
  ]);
}

/** 'YYYY-MM-DDTHH:mm' Eastern wall time -> Date (EDT until Nov 1 2026, EST after). */
function eastern(at: string): Date {
  return new Date(`${at}${at < '2026-11-01T02:00' ? '-04:00' : '-05:00'}`);
}


interface Row {
  id: string; kind: string; run: number; answer: string; draft?: string;
  facts: number; factsMissed: string[]; invented: string[]; words: number; ms: number; completionTokens: number;
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}

function summarize(label: string, rows: Row[]) {
  const n = rows.length;
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  return {
    label,
    answers: n,
    errors: rows.filter((r) => r.answer.startsWith('[ERROR')).length,
    accuracy: Math.round((100 * rows.reduce((s, r) => s + r.facts, 0)) / n),
    noInvention: Math.round((100 * rows.filter((r) => r.invented.length === 0).length) / n),
    avgWords: Math.round(rows.reduce((s, r) => s + r.words, 0) / n),
    over100: rows.filter((r) => r.words > 100).length,
    p50ms: ms[Math.floor(n / 2)],
    p90ms: ms[Math.floor(n * 0.9)],
    maxCompletionTokens: Math.max(...rows.map((r) => r.completionTokens)),
  };
}

function table(summaries: ReturnType<typeof summarize>[]): string {
  const head = 'label | answers | errors | accuracy % | no-invention % | avg words | >100 words | p50 ms | p90 ms | max completion tok';
  return [head, ...summaries.map((s) =>
    [s.label, s.answers, s.errors, s.accuracy, s.noInvention, s.avgWords, s.over100, s.p50ms, s.p90ms, s.maxCompletionTokens].join(' | '))].join('\n');
}

it('runs the Ask 3C eval', { timeout: 60 * 60_000 }, async () => {
  const compare = env('ASK_EVAL_COMPARE');
  if (compare) {
    const runs = compare.split(',').map((file) => JSON.parse(readFileSync(file, 'utf8')) as { summary: ReturnType<typeof summarize> });
    out(table(runs.map((r) => r.summary)));
    return;
  }

  loadKey();
  const config = askProviderConfig();
  if (!config.apiKey) throw new Error('ASK_API_KEY is not set in .env.local');
  const label = env('ASK_EVAL_LABEL', 'run');
  const selfCheck = env('ASK_EVAL_SELFCHECK', '1') !== '0';
  const effort = env('ASK_EVAL_EFFORT', 'high') as 'high' | 'max';
  const maxTokens = Number(env('ASK_EVAL_MAX_TOKENS', '0')) || undefined;
  const runs = Number(env('ASK_EVAL_RUNS', '2'));
  const only = env('ASK_EVAL_ONLY').split(',').filter(Boolean);
  const outDir = env('ASK_EVAL_OUT', path.join(tmpdir(), 'ask-eval'));
  mkdirSync(outDir, { recursive: true });

  const notes = await loadNotesForEval();
  const cases = CASES.filter((c) => only.length === 0 || only.some((o) => c.id.includes(o)));
  const jobs = Array.from({ length: runs }, (_, run) => cases.map((c) => ({ c, run }))).flat();

  const rows = await pool(jobs, 6, async ({ c, run }): Promise<Row> => {
    const user = c.user ?? EVAL_FIBER_REP;
    const seen = notesForAudience(notes, user);
    const system = buildSystemPrompt(seen, {
      firstName: 'Sam', dealerCodes: ['EVAL1234'], now: eastern(c.at ?? '2026-10-20T15:00'), home: 'Des Moines, IA',
      line: askLineFor(user, user.mainLine), solarNotes: hasSolarNotes(seen),
    });
    const messages: AskMessage[] = [{ role: 'system', content: system }, ...(c.history ?? []), { role: 'user', content: c.ask }];
    const started = Date.now();
    let answer = '';
    let draft: string | undefined;
    let completionTokens = 0;
    try {
      const result = await callAskModel(config, messages, { effort, maxTokens, ...(selfCheck ? { selfCheck: SELF_CHECK } : {}) });
      ({ answer, draft } = result);
      completionTokens = result.usage.completionTokens;
    } catch (error) {
      answer = `[ERROR ${error instanceof Error ? error.message : String(error)}]`;
    }
    const ms = Date.now() - started;
    const given = [system, ...(c.history ?? []).map((h) => h.content), c.ask].join('\n');
    return { id: c.id, kind: c.kind, run, answer, draft, ms, completionTokens, ...scoreAnswer(c, answer, given), words: words(answer) };
  });

  const summary = summarize(label, rows);
  const file = path.join(outDir, `${label}.json`);
  writeFileSync(file, JSON.stringify({ label, selfCheck, effort, maxTokens: maxTokens ?? 'default', summary, rows }, null, 2));
  for (const r of rows.filter((x) => x.facts < 1 || x.invented.length || x.words > 100)) {
    out(`- ${r.id}#${r.run} facts=${r.facts.toFixed(2)} missed=${r.factsMissed.join(';')} invented=${r.invented.join(';')} words=${r.words}\n  ${r.answer.replace(/\n/g, ' / ')}`);
  }
  out(table([summary]));
  out(`saved ${file}`);
});
