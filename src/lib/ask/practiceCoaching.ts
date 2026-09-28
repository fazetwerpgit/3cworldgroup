import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import { isPersonaId, type PersonaId, type PracticeEvent } from './practice';

// Practice coaching over time: the coach's skill scores, the rep's delivery
// from talk mode, the moment worth redoing, the owner's assignments and the
// owner's corrections to the coach. Shared by the practice routes and pages.

export const SKILLS = ['opener', 'discovery', 'objections', 'close'] as const;
export type Skill = (typeof SKILLS)[number];
export type SkillScores = Record<Skill, number>;

export const SKILL_LABELS: Record<Skill, string> = {
  opener: 'Opener',
  discovery: 'Discovery',
  objections: 'Objections',
  close: 'Close',
};

/** The coach's Skills line, as the format asks for it. */
export const SKILLS_FORMAT = 'Skills: Opener N/10, Discovery N/10, Objections N/10, Close N/10';

const SKILLS_LINE = /^\s*skills\s*:\s*opener\s+(\d{1,2})\s*\/\s*10\s*,\s*discovery\s+(\d{1,2})\s*\/\s*10\s*,\s*objections\s+(\d{1,2})\s*\/\s*10\s*,\s*close\s+(\d{1,2})\s*\/\s*10\s*\.?\s*$/im;

/** The four skill scores from the coach's Skills line, or null when it's missing or off (a score over 10). */
export function parseSkills(feedback: string): SkillScores | null {
  const match = SKILLS_LINE.exec(feedback);
  if (!match) return null;
  const [opener, discovery, objections, close] = match.slice(1, 5).map(Number);
  if ([opener, discovery, objections, close].some((n) => n < 1 || n > 10)) return null;
  return { opener, discovery, objections, close };
}

/** Whether a feedback line is the Skills line (the page shows it as its own row, not text). */
export const isSkillsLine = (line: string) => /^\s*skills\s*:/i.test(line);

// ---- delivery (talk mode) ----

/** What talk mode measured over one practice. Only lines the rep spoke count. */
export interface PracticeDelivery {
  /** Milliseconds the rep spoke into the mic. */
  talkMs: number;
  /** Milliseconds of the homeowner's voice played. */
  listenMs: number;
  /** Words in the rep's spoken lines. */
  words: number;
  /** "um", "uh", "you know", filler "like", counted in the spoken lines. */
  fillers: Record<string, number>;
  /** Spoken rep lines. */
  lines: number;
  /** Some of the homeowner's lines played in a voice that couldn't be timed: no talk share. */
  untimed?: boolean;
}

/**
 * The filler words in a spoken line, by word. "um" and "uh" always count;
 * "you know" and "like" only standing alone, set off by a pause (a comma, the
 * end of a sentence): "it's, like, fast" and "it's fast, you know?" count,
 * "you know it's not a promo" and "fast like cable" don't.
 */
export function fillerCount(line: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (word: string) => {
    counts[word] = (counts[word] ?? 0) + 1;
  };
  for (const match of line.matchAll(/\b(u+m+|u+h+|e+r+m+)\b/gi)) add(/^u+h+$/i.test(match[1]) ? 'uh' : 'um');
  // "you know" with a pause after it: "..., you know?", "you know, it's...".
  const times = (pattern: RegExp, word: string) => {
    for (let n = [...line.matchAll(pattern)].length; n > 0; n -= 1) add(word);
  };
  times(/\byou know\s*(?:[,.?!…]|$)/gi, 'you know');
  // "like" with a pause on either side: "Like, ...", "it's, like, ...", "..., like."
  times(/(?:^|[,.?!…]\s*)like\b|\blike\s*(?:[,.?!…]|$)/gi, 'like');
  return counts;
}

/** A delivery sent by the page, or null when it's missing, malformed or out of range (no mic lines: no stats). */
export function parseDelivery(raw: unknown): PracticeDelivery | null {
  const d = raw as Partial<PracticeDelivery> | null | undefined;
  const ms = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 3_600_000 ? Math.round(value) : null);
  const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100_000 ? (value as number) : null);
  const talkMs = ms(d?.talkMs);
  const listenMs = ms(d?.listenMs);
  const words = count(d?.words);
  const lines = count(d?.lines);
  if (talkMs === null || listenMs === null || words === null || lines === null || lines === 0 || talkMs === 0) return null;
  const fillers: Record<string, number> = {};
  for (const [word, n] of Object.entries(d?.fillers ?? {})) {
    if (['um', 'uh', 'like', 'you know'].includes(word) && count(n) !== null) fillers[word] = n as number;
  }
  return { talkMs, listenMs, words, fillers, lines, ...(d?.untimed === true ? { untimed: true } : {}) };
}

/**
 * Delivery as one plain line for the page, never a score: "You talked 40% of
 * the time · 150 words a minute · 2 fillers a minute (um 3, like 1)". The talk
 * share needs the homeowner's voice timed (none when it didn't play, or a
 * line of it couldn't be timed).
 */
export function deliveryLine(delivery: PracticeDelivery): string {
  const talkMinutes = delivery.talkMs / 60_000;
  const fillers = Object.entries(delivery.fillers).filter(([, n]) => n > 0);
  const total = fillers.reduce((sum, [, n]) => sum + n, 0);
  const perMinute = Math.round((total / talkMinutes) * 10) / 10;
  const parts = [
    delivery.listenMs > 0 && !delivery.untimed ? `You talked ${Math.round((delivery.talkMs / (delivery.talkMs + delivery.listenMs)) * 100)}% of the time` : null,
    `${Math.round(delivery.words / talkMinutes)} words a minute`,
    total
      ? `${perMinute} filler${perMinute === 1 ? '' : 's'} a minute (${fillers
          .sort((a, b) => b[1] - a[1])
          .map(([word, n]) => `${word} ${n}`)
          .join(', ')})`
      : 'no fillers heard',
  ];
  return parts.filter(Boolean).join(' · ');
}

// ---- redo that moment ----

/** How one rep line (or the price card) landed: kept per session so the weakest moment can be redone. */
export interface PracticeStep {
  /** The conversation's length when the homeowner answered it: the line is turn at - 1. */
  at: number;
  event: PracticeEvent;
  /** The homeowner's patience before that line. */
  patience: number;
}

/** The steps read back from Firestore; anything malformed is dropped. */
export function parseSteps(raw: unknown): PracticeStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (step): step is PracticeStep =>
      Number.isInteger(step?.at) &&
      step.at >= 2 &&
      ['ok', 'weak', 'lie', 'abuse'].includes(step?.event) &&
      Number.isInteger(step?.patience) &&
      step.patience >= 0
  );
}

/**
 * Where "Redo that moment" restarts: the conversation up to the worst line
 * (the first abusive one, else the first caught lie, else the first weak
 * one), which is left out, and the homeowner's patience as it was then. Null
 * when every line landed.
 */
export function redoPoint(steps: readonly PracticeStep[]): { keep: number; patience: number } | null {
  for (const worst of ['abuse', 'lie', 'weak'] as const) {
    const step = steps.find((candidate) => candidate.event === worst);
    if (step) return { keep: step.at - 1, patience: step.patience };
  }
  return null;
}

// ---- what the pages get ----

/** One finished practice on the rep's own My practice view (GET /api/portal/ask/practice/mine). */
export interface MyPracticeSession {
  id: string;
  /** Who it was: "Price shopper". */
  persona: string;
  result: string | null;
  score: number | null;
  skills: SkillScores | null;
  delivery: PracticeDelivery | null;
  redo: boolean;
  feedback: string;
  createdAt: string;
}

/** An assignment as the rep sees it. */
export interface MyAssignment {
  id: string;
  /** "Skeptic" or "any homeowner". */
  persona: string;
  count: number;
  done: number;
  due: string;
}

export interface MyPracticeReply {
  /** The last 30 days, newest first. */
  sessions: MyPracticeSession[];
  assignments: MyAssignment[];
}

/** One assignment on the owner's Practice tab, with each rep's count. */
export interface AssignmentView extends PracticeAssignment {
  personaLabel: string;
  reps: { uid: string; name: string; done: number }[];
}

/** A correction the owner made, shown under the session it's about. */
export interface CorrectionView {
  id: string;
  part: CorrectionPart;
  original: string;
  take: string;
  createdAt: string | null;
}

/** Per skill: the average over the sessions, and the scores oldest to newest (for the trend). */
export function skillTrend(sessions: readonly MyPracticeSession[]): Record<Skill, { average: number | null; scores: number[] }> {
  const graded = sessions.filter((session) => session.skills && !session.redo).toReversed();
  return Object.fromEntries(
    SKILLS.map((skill) => {
      const scores = graded.map((session) => session.skills![skill]);
      const average = scores.length ? Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 10) / 10 : null;
      return [skill, { average, scores }];
    })
  ) as Record<Skill, { average: number | null; scores: number[] }>;
}

// ---- owner assignments ----

export interface PracticeAssignment {
  id: string;
  /** One rep, or null for every rep. */
  repUid: string | null;
  repName: string;
  persona: PersonaId | 'any';
  count: number;
  /** The last day it counts, Chicago time: YYYY-MM-DD. */
  due: string;
  /** ISO time it was set; sessions from then on count. */
  createdAt: string;
}

/** A finished practice as assignments count it. */
export interface CountedSession {
  uid: string;
  persona: string;
  /** ISO time the feedback was logged. */
  createdAt: string;
  /** A "Redo that moment" session: practice, but not a new door. */
  redo: boolean;
  /** A real practice: at least ASSIGNMENT_MIN_LINES rep lines and nothing abusive. */
  real: boolean;
}

/** Rep lines a practice needs to count toward an assignment (one line and End isn't practice). */
export const ASSIGNMENT_MIN_LINES = 3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An assignment as the owner sends it, or an error to show. */
export function parseAssignment(
  raw: unknown,
  today: string
): { ok: true; value: Omit<PracticeAssignment, 'id' | 'createdAt' | 'repName'> } | { ok: false; error: string } {
  const body = raw as { repUid?: unknown; persona?: unknown; count?: unknown; due?: unknown } | null;
  const repUid = body?.repUid === null || body?.repUid === 'all' ? null : typeof body?.repUid === 'string' && body.repUid ? body.repUid : undefined;
  if (repUid === undefined) return { ok: false, error: 'Pick a rep or everyone.' };
  const persona = body?.persona === 'any' ? 'any' : isPersonaId(body?.persona) ? body.persona : null;
  if (!persona) return { ok: false, error: 'Pick a homeowner type or any.' };
  const count = body?.count;
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 50) return { ok: false, error: 'Sessions: 1 to 50.' };
  const due = body?.due;
  if (typeof due !== 'string' || !DAY.test(due) || due < today) return { ok: false, error: 'Pick a due date from today on.' };
  return { ok: true, value: { repUid, persona, count: count as number, due } };
}

/**
 * How many sessions each rep has done toward an assignment: finished real
 * practices (not redos; ASSIGNMENT_MIN_LINES rep lines, nothing abusive) by that rep, from when it was set through its due
 * day, with the homeowner type it asks for.
 */
export function assignmentDone(assignment: PracticeAssignment, sessions: readonly CountedSession[], uid: string): number {
  return sessions.filter(
    (session) =>
      session.uid === uid &&
      !session.redo &&
      session.real &&
      session.createdAt >= assignment.createdAt &&
      chicagoDayKey(new Date(session.createdAt)) <= assignment.due &&
      (assignment.persona === 'any' || session.persona === assignment.persona)
  ).length;
}

/** The assignments a rep has open: theirs or everyone's, not yet due-passed, with what they've done. */
export function openAssignmentsFor(
  uid: string,
  assignments: readonly PracticeAssignment[],
  sessions: readonly CountedSession[],
  today: string
): { assignment: PracticeAssignment; done: number }[] {
  return assignments
    .filter((assignment) => (assignment.repUid === null || assignment.repUid === uid) && assignment.due >= today)
    .map((assignment) => ({ assignment, done: Math.min(assignment.count, assignmentDone(assignment, sessions, uid)) }))
    .sort((a, b) => a.assignment.due.localeCompare(b.assignment.due));
}

/**
 * The homeowner type the rep's next knock should be, to work an assignment:
 * the soonest-due open one that names a type and isn't done. Null leaves the
 * knock to the shuffle bag.
 */
export function assignedPersona(open: readonly { assignment: PracticeAssignment; done: number }[]): PersonaId | null {
  const next = open.find(({ assignment, done }) => assignment.persona !== 'any' && done < assignment.count);
  return next && next.assignment.persona !== 'any' ? next.assignment.persona : null;
}

// ---- the owner's corrections to the coach ----

export const CORRECTION_PARTS = [
  'score',
  'result',
  'opener',
  'discovery',
  'objections',
  'close',
  'worked-1',
  'worked-2',
  'fix',
  'try',
] as const;
export type CorrectionPart = (typeof CORRECTION_PARTS)[number];

export const CORRECTION_LABELS: Record<CorrectionPart, string> = {
  score: 'Score',
  result: 'Result',
  opener: 'Opener score',
  discovery: 'Discovery score',
  objections: 'Objections score',
  close: 'Close score',
  'worked-1': 'What worked, first bullet',
  'worked-2': 'What worked, second bullet',
  fix: 'Fix next time',
  try: 'Try this line',
};

export interface CoachCorrection {
  part: CorrectionPart;
  /** What the coach said for that part. */
  original: string;
  /** The owner's right take. */
  take: string;
  personaLabel: string;
}

export const MAX_CORRECTION_CHARS = 600;
/** How many of the owner's latest corrections the coach reads. */
export const CORRECTIONS_IN_PROMPT = 20;

/** What the coach said for one part of its feedback ('' when that part isn't there). */
export function feedbackPart(feedback: string, part: CorrectionPart): string {
  const line = (heading: RegExp) => feedback.split('\n').find((l) => heading.test(l))?.replace(/^[^:]*:\s*/, '').trim() ?? '';
  if (part === 'score') return line(/^\s*score\s*:/i);
  if (part === 'result') return line(/^\s*result\s*:/i);
  if (part === 'fix') return line(/^\s*fix next time\s*:/i);
  if (part === 'try') return line(/^\s*try this line\s*:/i);
  if (part === 'worked-1' || part === 'worked-2') {
    const bullets = feedback.split('\n').filter((l) => /^\s*[-•*]\s+/.test(l));
    return bullets[part === 'worked-1' ? 0 : 1]?.replace(/^\s*[-•*]\s+/, '').trim() ?? '';
  }
  const skills = parseSkills(feedback);
  return skills ? `${SKILL_LABELS[part]} ${skills[part]}/10` : '';
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The owner's corrections as calibration for the coach, newest first; '' when there are none. */
export function correctionsBlock(corrections: readonly CoachCorrection[]): string {
  if (corrections.length === 0) return '';
  const lines = corrections.slice(0, CORRECTIONS_IN_PROMPT).map((c) => {
    const said = c.original ? `the coach said "${clip(c.original, 160)}"; ` : '';
    return `- ${CORRECTION_LABELS[c.part]}, ${c.personaLabel} door: ${said}the owner says: "${clip(c.take, MAX_CORRECTION_CHARS)}"`;
  });
  return `=== Calibration: where the owner said the coach was wrong (newest first) ===
Learn from these: grade the same way the owner would. They are examples, not facts about this rep.
${lines.join('\n')}`;
}
