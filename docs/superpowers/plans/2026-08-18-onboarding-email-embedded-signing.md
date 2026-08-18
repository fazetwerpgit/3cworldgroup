# Onboarding Sender Email + Embedded SignWell Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding emails send from `ONBOARDING_EMAIL_FROM`, candidates sign SignWell documents inside the portal (embedded signing), and the public invite-token onboarding page is restyled to the portal design language.

**Architecture:** Extend `sendEmail`/`dispatchToUser` with an optional from-override threaded to the six onboarding email call sites. Flip SignWell to `embedded_signing: true`, capture `recipients[].embedded_signing_url` in `EnvelopeResult`, persist it as `esignSigningUrl` on `userOnboarding/{userId}_{itemId}`, expose it owner-only through the existing checklist GET, and render SignWell's embed widget from the authenticated onboarding board. Approval remains webhook-only.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin (Firestore), Postmark, SignWell API v1, vitest, Tailwind v4 + hand-written portal classes in `src/app/globals.css`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-onboarding-email-embedded-signing-design.md`. Branch: `onboarding/completion`. LOCAL COMMITS ONLY — never `git push`, never deploy.
- Baseline: 68 test files / 572 tests passing (`npx vitest run`). Gates after every task: `npx vitest run`, `npx tsc --noEmit`. Final task adds `npm run build`.
- Every NEW test must be proven to fail first (TDD) — and where a test stubs a collaborator, the stub must be argument-sensitive (Task 8 lesson: a stub that ignores its arguments is a plan failure).
- The webhook route stays the ONLY writer of `status: 'approved'` on esign items. No UI or new route may write approval.
- `embedded_signing_url` is a bearer capability: only the owning user's authenticated request may ever receive it.
- Test files are colocated (`foo.ts` → `foo.test.ts`). Route tests mock `@/lib/...` modules via `vi.hoisted` + `vi.mock` before importing the route. Env vars via `vi.stubEnv`, globals via `vi.stubGlobal`, cleanup in `afterEach`.
- No emojis anywhere. UI must look complete with zero animation (reduce-motion).
- Copy style: plain, direct, second person ("Sign it here").

---

### Task 1: `sendEmail` from-override + `onboardingFrom()` helper

**Files:**
- Modify: `src/lib/email/sendEmail.ts`
- Test: `src/lib/email/sendEmail.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EmailInput.from?: string`; `export function onboardingFrom(): string | undefined` reading `ONBOARDING_EMAIL_FROM`. `sendEmail` uses `input.from ?? process.env.EMAIL_FROM` as the Postmark `From`.

- [ ] **Step 1: Write the failing tests** (append to existing `describe` in `sendEmail.test.ts`, following the file's existing `vi.stubGlobal('fetch', ...)` / `vi.stubEnv` pattern):

```ts
it('uses the from override when provided', async () => {
  vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
  vi.stubEnv('EMAIL_FROM', 'notifications@example.com');
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await sendEmail({ to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't', from: 'onboarding@3cworldgroup.com' });
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  expect(body.From).toBe('onboarding@3cworldgroup.com');
});

it('falls back to EMAIL_FROM when from is undefined', async () => {
  vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
  vi.stubEnv('EMAIL_FROM', 'notifications@example.com');
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await sendEmail({ to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't', from: undefined });
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  expect(body.From).toBe('notifications@example.com');
});

describe('onboardingFrom', () => {
  it('returns the env value when set', () => {
    vi.stubEnv('ONBOARDING_EMAIL_FROM', 'onboarding@3cworldgroup.com');
    expect(onboardingFrom()).toBe('onboarding@3cworldgroup.com');
  });
  it('returns undefined when unset or empty', () => {
    vi.stubEnv('ONBOARDING_EMAIL_FROM', '');
    expect(onboardingFrom()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/email/sendEmail.test.ts`
Expected: FAIL — `onboardingFrom` not exported; `body.From` is `notifications@example.com` in the override test.

- [ ] **Step 3: Implement** in `src/lib/email/sendEmail.ts`:

```ts
export interface EmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  /** Optional sender override; falls back to EMAIL_FROM so a missing env can never block delivery. */
  from?: string;
}

/** Sender for candidate-facing onboarding emails. Undefined when unconfigured (callers fall back). */
export function onboardingFrom(): string | undefined {
  return process.env.ONBOARDING_EMAIL_FROM || undefined;
}
```

and inside `sendEmail`, replace `const from = process.env.EMAIL_FROM;` with:

```ts
const from = input.from ?? process.env.EMAIL_FROM;
```

(The existing `if (!token || !from)` guard stays and now also covers a missing override + missing global.)

- [ ] **Step 4: Run tests, verify pass**: `npx vitest run src/lib/email/sendEmail.test.ts` → all pass. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/sendEmail.ts src/lib/email/sendEmail.test.ts
git commit -m "feat(email): optional from override + onboardingFrom helper"
```

---

### Task 2: Thread the onboarding sender through dispatch + all six call sites

**Files:**
- Modify: `src/lib/alerts/dispatch.ts` (DispatchInput + sendEmail call, line ~39)
- Modify: `src/app/api/portal/recruiting/invites/route.ts:192-195`
- Modify: `src/app/api/portal/auth/users/[id]/route.ts:290-299`
- Modify: `src/app/api/portal/onboarding/review/route.ts:244-259`
- Modify: `src/lib/onboarding/stallDetection.ts:75-86`
- Modify: `src/lib/esign/autoSend.ts:251-258`
- Modify: `src/lib/onboarding/activation.ts:82-90`
- Test: `src/lib/alerts/dispatch.test.ts` (+ update any existing call-site tests that assert `dispatchToUser` args)

**Interfaces:**
- Consumes: `onboardingFrom()` from Task 1 (`@/lib/email/sendEmail`).
- Produces: `DispatchInput.emailFrom?: string`. Contract: every onboarding-facing dispatch/send passes `emailFrom: onboardingFrom()` (or `from: onboardingFrom()` for the one direct `sendEmail`). `managerAlertEmail` (alertTasks broadcast) and `formSubmissionEmail` (notifySubmission) are deliberately NOT touched.

- [ ] **Step 1: Failing test** in `dispatch.test.ts` (follow its existing mock style; the key assertion must be argument-sensitive):

```ts
it('forwards emailFrom to sendEmail', async () => {
  // arrange existing mocks so users/{uid} resolves an email address
  await dispatchToUser({
    userId: 'u1', type: 'system', title: 't', message: 'm', link: '/x',
    email: { subject: 's', htmlBody: '<p>h</p>', textBody: 't' },
    emailFrom: 'onboarding@3cworldgroup.com',
  });
  expect(sendEmailMock).toHaveBeenCalledWith(
    expect.objectContaining({ from: 'onboarding@3cworldgroup.com', subject: 's' })
  );
});
```

- [ ] **Step 2: Verify it fails**: `npx vitest run src/lib/alerts/dispatch.test.ts` → FAIL (unknown property / from undefined).

- [ ] **Step 3: Implement.** In `dispatch.ts`, add to `DispatchInput`:

```ts
  /** Optional sender override forwarded to sendEmail (onboarding emails use onboardingFrom()). */
  emailFrom?: string;
```

and change the email branch to:

```ts
if (to) await sendEmail({ to, ...input.email!, from: input.emailFrom });
```

Then the six call sites — each is a one-property addition:

1. `invites/route.ts` (direct sendEmail; import `onboardingFrom` from `@/lib/email/sendEmail`):
```ts
void sendEmail({
  to: candidateEmail,
  from: onboardingFrom(),
  ...inviteEmail({ candidateName, ownerName: requester.name, inviteUrl }),
}).catch(() => {});
```
2. `users/[id]/route.ts` checklist-ready dispatch: add `emailFrom: onboardingFrom(),` beside `email: checklistReadyEmail({...})`.
3. `review/route.ts` rejection dispatch: add `emailFrom: onboardingFrom(),` beside `email: itemRejectedEmail({...})`.
4. `stallDetection.ts` nudge dispatch: add `emailFrom: onboardingFrom(),` beside `email: nudgeEmail({ name, tier, portalUrl })`.
5. `autoSend.ts` sent-docs dispatch: add `emailFrom: onboardingFrom(),` beside `email: esignSentEmail(...)`.
6. `activation.ts` activation dispatch: add `emailFrom: onboardingFrom(),` beside `email: activationEmail({ name })`.

- [ ] **Step 4: Run gates.** `npx vitest run` (fix any existing call-site tests that assert exact `dispatchToUser` args — extend their expectations to include `emailFrom`), `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/alerts src/lib/onboarding src/lib/esign/autoSend.ts "src/app/api/portal/recruiting/invites/route.ts" "src/app/api/portal/auth/users/[id]/route.ts" "src/app/api/portal/onboarding/review/route.ts"
git commit -m "feat(email): onboarding emails send from ONBOARDING_EMAIL_FROM"
```

---

### Task 3: SignWell embedded signing in provider + adapter

**Files:**
- Modify: `src/lib/esign/provider.ts` (EnvelopeResult)
- Modify: `src/lib/esign/signwell.ts` (createEnvelope request + response parsing)
- Test: `src/lib/esign/signwell.test.ts`

**Interfaces:**
- Consumes: existing `EnvelopeRequest`, `SIGNER_RECIPIENT_ID` const in signwell.ts.
- Produces: `EnvelopeResult` becomes `{ envelopeId: string; embeddedSigningUrl?: string }` (optional — a future adobe adapter need not supply it). `createEnvelope` sends `embedded_signing: true` and returns the signer's `embedded_signing_url` when present.

- [ ] **Step 1: Failing tests** in `signwell.test.ts` (reuse its existing fetch-stub pattern):

```ts
it('requests embedded signing', async () => {
  // arrange fetch stub returning { id: 'env_1', recipients: [] }
  await signwellProvider.createEnvelope(baseRequest);
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  expect(body.embedded_signing).toBe(true);
});

it('returns the signer embedded_signing_url from the response', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    id: 'env_1',
    recipients: [{ id: SIGNER_RECIPIENT_ID, embedded_signing_url: 'https://www.signwell.com/e/abc' }],
  }), { status: 201 }));
  const result = await signwellProvider.createEnvelope(baseRequest);
  expect(result).toEqual({ envelopeId: 'env_1', embeddedSigningUrl: 'https://www.signwell.com/e/abc' });
});

it('omits embeddedSigningUrl when the response has none', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'env_2' }), { status: 201 }));
  const result = await signwellProvider.createEnvelope(baseRequest);
  expect(result.envelopeId).toBe('env_2');
  expect(result.embeddedSigningUrl).toBeUndefined();
});
```

- [ ] **Step 2: Verify failure**: `npx vitest run src/lib/esign/signwell.test.ts` → FAIL (`embedded_signing` false; no `embeddedSigningUrl`).

- [ ] **Step 3: Implement.** `provider.ts`:

```ts
export interface EnvelopeResult {
  envelopeId: string;
  /** Present when the provider supports in-portal (embedded) signing. Bearer capability — owner-only. */
  embeddedSigningUrl?: string;
}
```

`signwell.ts` — in the request JSON set `embedded_signing: true` (do NOT set per-recipient `send_email`; SignWell suppresses signer emails by default in embedded mode, and `embedded_signing_notifications` stays unset). Replace response parsing:

```ts
const data = (await res.json()) as {
  id: string;
  recipients?: Array<{ id?: string; embedded_signing_url?: string | null }>;
};
const signer = data.recipients?.find((r) => r.id === SIGNER_RECIPIENT_ID) ?? data.recipients?.[0];
const embeddedSigningUrl = signer?.embedded_signing_url || undefined;
return embeddedSigningUrl ? { envelopeId: data.id, embeddedSigningUrl } : { envelopeId: data.id };
```

- [ ] **Step 4: Gates**: `npx vitest run src/lib/esign/`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**: `git add src/lib/esign/provider.ts src/lib/esign/signwell.ts src/lib/esign/signwell.test.ts && git commit -m "feat(esign): SignWell embedded signing, EnvelopeResult carries signing URL"`

---

### Task 4: Persist `esignSigningUrl` and serve it owner-only

**Files:**
- Modify: `src/lib/esign/autoSend.ts` (`sendOne` success write, lines ~113-165)
- Modify: `src/app/api/portal/onboarding/route.ts` (GET response mapping)
- Test: `src/lib/esign/autoSend.test.ts`, `src/app/api/portal/onboarding/route.test.ts`

**Interfaces:**
- Consumes: `EnvelopeResult.embeddedSigningUrl` (Task 3); `requireVerifiedSelfOrManagement` gate result (`{ uid, isManagement }`) already used by the GET.
- Produces: Firestore field `esignSigningUrl: string | null` on `userOnboarding/{userId}_{itemId}`; GET checklist items gain `esignSigningUrl: string | null` — non-null ONLY when `gate.uid === userId` (management viewing someone else gets `null`).

- [ ] **Step 1: Failing tests.**

`autoSend.test.ts` — extend the existing success-path test's Firestore `.set` assertion (argument-sensitive):

```ts
expect(setMock).toHaveBeenCalledWith(
  expect.objectContaining({
    esignEnvelopeId: 'env_1',
    esignSigningUrl: 'https://www.signwell.com/e/abc',
    status: 'submitted',
  }),
  { merge: true },
);
```
(and stub `createEnvelope` to resolve `{ envelopeId: 'env_1', embeddedSigningUrl: 'https://www.signwell.com/e/abc' }`; add a second case where `embeddedSigningUrl` is undefined → expect `esignSigningUrl: null`.)

`onboarding/route.test.ts` — two cases:

```ts
it('includes esignSigningUrl for the owner', async () => {
  // gate mock: { ok: true, uid: 'u1', isManagement: false }; progress doc has esignSigningUrl
  const res = await GET(makeRequest('u1'));
  const json = await res.json();
  const item = json.items.find((i: { id: string }) => i.id === 'contract');
  expect(item.esignSigningUrl).toBe('https://www.signwell.com/e/abc');
});

it('nulls esignSigningUrl for management viewing another user', async () => {
  // gate mock: { ok: true, uid: 'admin1', isManagement: true }, target userId 'u1'
  const res = await GET(makeRequest('u1'));
  const json = await res.json();
  const item = json.items.find((i: { id: string }) => i.id === 'contract');
  expect(item.esignSigningUrl).toBeNull();
});
```

- [ ] **Step 2: Verify failures**: `npx vitest run src/lib/esign/autoSend.test.ts src/app/api/portal/onboarding/route.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `autoSend.ts` success write adds one field:

```ts
esignSigningUrl: result.embeddedSigningUrl ?? null,
```

`onboarding/route.ts` GET: where items are mapped into the response, add:

```ts
const isOwner = gate.uid === userId;
// per item:
esignSigningUrl: isOwner ? ((progress?.esignSigningUrl as string | undefined) ?? null) : null,
```

- [ ] **Step 4: Gates**: `npx vitest run`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**: `git add src/lib/esign/autoSend.ts src/lib/esign/autoSend.test.ts "src/app/api/portal/onboarding/route.ts" "src/app/api/portal/onboarding/route.test.ts" && git commit -m "feat(esign): persist embedded signing URL, serve owner-only via checklist GET"`

---

### Task 5: Copy — email + helper texts say "sign in the portal"

**Files:**
- Modify: `src/lib/email/templates.ts` (`esignSentEmail`, line 65)
- Modify: `src/lib/esign/autoSend.ts` (call site message, lines ~251-258)
- Modify: `src/lib/onboarding/esign.ts` (`ESIGN_HELPER_TEXT`, `ESIGN_FAILURE_HELPER_TEXT`)
- Modify: `src/components/onboarding/MemberLineOnboardingBoard.tsx` (`nextActionLabel`, line ~26-36: `'Check email'` → `'Sign now'`)
- Test: `src/lib/email/templates.test.ts` (+ update any tests asserting the old strings)

**Interfaces:**
- Consumes: `appBaseUrl()` (templates.ts line 7).
- Produces: `esignSentEmail(p: { name: string; docLabels: string[]; portalUrl: string }): EmailContent`.

- [ ] **Step 1: Failing test** in `templates.test.ts`:

```ts
it('esignSentEmail points to in-portal signing', () => {
  const c = esignSentEmail({ name: 'Ana', docLabels: ['Contract'], portalUrl: 'https://x/portal/onboarding' });
  expect(c.subject).toBe('Your documents are ready to sign');
  expect(c.textBody).toContain('https://x/portal/onboarding');
  expect(c.textBody).not.toMatch(/emailed you/i);
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement**:

```ts
export function esignSentEmail(p: { name: string; docLabels: string[]; portalUrl: string }): EmailContent {
  const subject = 'Your documents are ready to sign';
  const list = p.docLabels.join(', ');
  return {
    subject,
    textBody: `Hi ${p.name},\n\nThe following documents are ready for your signature: ${list}.\n\nSign them in the portal: ${p.portalUrl}\n`,
    htmlBody: layout(
      subject,
      `<p>Hi ${p.name},</p><p>The following documents are ready for your signature: <strong>${list}</strong>.</p><p><a href="${p.portalUrl}">Open your onboarding checklist</a> and sign them right there - it only takes a minute.</p>`,
    ),
  };
}
```

`autoSend.ts` call site:

```ts
message: `Ready to sign: ${sentLabels.join(', ')}`,
email: esignSentEmail({ name: signerName, docLabels: sentLabels, portalUrl: `${appBaseUrl()}/portal/onboarding` }),
```
(import `appBaseUrl` from `@/lib/email/templates`.)

`src/lib/onboarding/esign.ts`:

```ts
export const ESIGN_HELPER_TEXT =
  'This document is signed electronically right here in the portal - it completes automatically once signed.';
export const ESIGN_FAILURE_HELPER_TEXT =
  'We hit a snag preparing this document. We are on it - no action needed from you.';
```

`MemberLineOnboardingBoard.tsx` `nextActionLabel`: `'Check email'` → `'Sign now'`.

- [ ] **Step 4: Gates**: `npx vitest run` (update every test asserting the old copy — search for `emailed you`, `Check email`, `Check your inbox`), `npx tsc --noEmit`.

- [ ] **Step 5: Commit**: `git commit -am "feat(esign): copy for in-portal signing"`

---

### Task 6: In-portal signing UI + embed-error alert route

**Files:**
- Create: `src/lib/esign/embedClient.ts` (script loader + types)
- Create: `src/components/onboarding/EsignSignAction.tsx`
- Create: `src/app/api/portal/onboarding/esign-embed-error/route.ts`
- Modify: `src/components/onboarding/MemberLineOnboardingBoard.tsx` (sheet body, lines ~186-196)
- Modify: `src/app/portal/onboarding/page.tsx` (pass a `refresh` callback = existing `fetchChecklist`; thread `esignSigningUrl` through item props if the board's item type needs it)
- Test: `src/lib/esign/embedClient.test.ts`, `src/app/api/portal/onboarding/esign-embed-error/route.test.ts`

**Interfaces:**
- Consumes: `esignSigningUrl` on checklist items (Task 4); `requireVerifiedUser` from `@/lib/auth/requireVerifiedAdmin`; `createAlertTask` from `@/lib/alerts/alertTasks`.
- Produces: `loadSignWellEmbed(): Promise<SignWellEmbedConstructor>`; `<EsignSignAction item={...} signingUrl={...} onRefresh={() => void} />`; `POST /api/portal/onboarding/esign-embed-error` body `{ itemId: string }` → raises a `review_needed` alert for the caller.

- [ ] **Step 1: `embedClient.ts`** (implement with test alongside):

```ts
const SCRIPT_SRC = 'https://static.signwell.com/assets/embedded.js';

export interface SignWellEmbedInstance { open(): void; close(): void; }
export interface SignWellEmbedOptions {
  url: string;
  events?: {
    completed?: (e: { id: string }) => void;
    declined?: (e: { id: string; declineReason?: string }) => void;
    closed?: (e: { id: string }) => void;
    error?: (e: unknown) => void;
  };
}
export type SignWellEmbedConstructor = new (opts: SignWellEmbedOptions) => SignWellEmbedInstance;

declare global { interface Window { SignWellEmbed?: SignWellEmbedConstructor } }

let loader: Promise<SignWellEmbedConstructor> | null = null;

/** Loads SignWell's embed script once and resolves its constructor. Rejects on script failure. */
export function loadSignWellEmbed(): Promise<SignWellEmbedConstructor> {
  if (window.SignWellEmbed) return Promise.resolve(window.SignWellEmbed);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.SignWellEmbed) resolve(window.SignWellEmbed);
        else reject(new Error('SignWellEmbed missing after script load'));
      };
      script.onerror = () => { loader = null; reject(new Error('failed to load SignWell embed script')); };
      document.head.appendChild(script);
    });
  }
  return loader;
}
```

Test (jsdom, colocated): resolve when `window.SignWellEmbed` pre-set; reject when script errors (simulate by dispatching `error` on the appended script element); loader resets after failure so a retry re-appends.

- [ ] **Step 2: Alert route** `esign-embed-error/route.ts` — TDD (route test first, mocking gate + `createAlertTask`, argument-sensitive on `kind`/`subjectUserId`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { itemId } = (await request.json().catch(() => ({}))) as { itemId?: string };
  const item = ONBOARDING_ITEMS.find((i) => i.id === itemId);
  if (!item) return NextResponse.json({ error: 'unknown item' }, { status: 400 });
  await createAlertTask({
    kind: 'review_needed',
    subjectUserId: gate.uid,
    subjectName: gate.name,
    title: 'In-portal signing failed to load',
    message: `${gate.name} could not open the signing window for ${item.label}. The signing link may be stale.`,
    link: '/portal/admin/onboarding',
  });
  return NextResponse.json({ ok: true });
}
```

Route test cases: 401 path (gate not ok), 400 unknown item, success calls `createAlertTask` with `expect.objectContaining({ kind: 'review_needed', subjectUserId: 'u1', title: 'In-portal signing failed to load' })`.

- [ ] **Step 3: `EsignSignAction.tsx`** — client component, states `idle | opening | signing | confirming | done | declined | failed`:

```tsx
'use client';
import { useCallback, useRef, useState } from 'react';
import { loadSignWellEmbed } from '@/lib/esign/embedClient';
import { authHeaders } from '@/lib/firebase/getIdToken';
import { ESIGN_FAILURE_HELPER_TEXT } from '@/lib/onboarding/esign';

const CONFIRM_POLL_MS = 3000;
const CONFIRM_POLL_MAX = 10;

export function EsignSignAction(props: { itemId: string; signingUrl: string; onRefresh: () => void }) {
  const [state, setState] = useState<'idle' | 'opening' | 'signing' | 'confirming' | 'declined' | 'failed'>('idle');
  const polls = useRef(0);

  const reportFailure = useCallback(async () => {
    setState('failed');
    try {
      await fetch('/api/portal/onboarding/esign-embed-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ itemId: props.itemId }),
      });
    } catch { /* alert is best-effort; the UI failure state is already shown */ }
  }, [props.itemId]);

  const beginConfirmPolling = useCallback(() => {
    setState('confirming');
    polls.current = 0;
    const tick = () => {
      polls.current += 1;
      props.onRefresh(); // parent refetches the checklist; approval arrives via webhook
      if (polls.current < CONFIRM_POLL_MAX) setTimeout(tick, CONFIRM_POLL_MS);
    };
    setTimeout(tick, CONFIRM_POLL_MS);
  }, [props]);

  const open = useCallback(async () => {
    setState('opening');
    try {
      const SignWellEmbed = await loadSignWellEmbed();
      const embed = new SignWellEmbed({
        url: props.signingUrl,
        events: {
          completed: () => beginConfirmPolling(),
          declined: () => setState('declined'),
          closed: () => setState((s) => (s === 'signing' ? 'idle' : s)),
          error: () => { void reportFailure(); },
        },
      });
      setState('signing');
      embed.open();
    } catch {
      void reportFailure();
    }
  }, [props.signingUrl, beginConfirmPolling, reportFailure]);

  if (state === 'confirming') return <div className="member-line-note">Signature received - confirming with the signing service. This completes automatically.</div>;
  if (state === 'declined') return <div className="member-line-note warn">You declined this document. Reach out to your manager if that was a mistake.</div>;
  if (state === 'failed') return <div className="member-line-note warn">{ESIGN_FAILURE_HELPER_TEXT}</div>;
  return (
    <button type="button" className="member-line-action" onClick={() => void open()} disabled={state === 'opening'}>
      {state === 'opening' ? 'Opening...' : 'Sign now'}
    </button>
  );
}
```

(Match the board's actual button/note class names — reuse whatever `renderItemAction` uses, e.g. `member-line-action`; check the file and keep its idiom. The `confirming` copy must not promise approval — the webhook is authoritative.)

- [ ] **Step 4: Wire into the board.** In `MemberLineOnboardingBoard.tsx` sheet body, replace the esign branch:

```tsx
{isEsignItem(item.id) ? (
  item.status === 'approved' ? null
  : item.esignSigningUrl ? (
    <EsignSignAction itemId={item.id} signingUrl={item.esignSigningUrl} onRefresh={onRefresh} />
  ) : (
    <div className="member-line-note warn">
      {item.esignDispatch?.state === 'failed' ? ESIGN_FAILURE_HELPER_TEXT : 'Preparing your document - check back in a minute.'}
    </div>
  )
) : ( renderItemAction(item) )}
```

Add `esignSigningUrl?: string | null` to the board's item prop type and an `onRefresh: () => void` prop; in `page.tsx` pass `onRefresh={fetchChecklist}` and make sure the API's `esignSigningUrl` field flows into the items passed down.

- [ ] **Step 5: Gates**: `npx vitest run`, `npx tsc --noEmit`, `npx next lint` (or the repo's eslint script).

- [ ] **Step 6: Commit**: `git add -A src/lib/esign src/components/onboarding "src/app/api/portal/onboarding/esign-embed-error" src/app/portal/onboarding/page.tsx && git commit -m "feat(esign): in-portal embedded signing UI with confirm polling and loud failure"`

---

### Task 7: Restyle the public invite-token onboarding page to portal idiom

**Files:**
- Modify: `src/app/onboard/[token]/page.tsx`
- Reference (read, don't modify): `src/components/member/MemberLine.tsx`, `src/app/portal/dashboard/page.tsx`, `src/app/globals.css` (tokens at `:root`, `.portal-display`, `.portal-num`, `.portal-metallic-num`, `.portal-enter*`, `.member-line-*` classes)

**Interfaces:** none new — visual-only. All fetch/submit logic, field names, validation, and copy stay byte-identical unless a class change forces a wrapper element.

- [ ] **Step 1:** Rework the page's presentation to the portal's "line/board" idiom while keeping the existing component structure and handlers:
  - Page background/frame: navy-on-light treatment consistent with the portal (`--accent-dark: #0A1F44` headings, `--accent-green: #8dc63f` accents, `--section-bg: #E8F0F8` canvas) instead of the current bare white + slate.
  - Masthead: replicate the `MemberLineMasthead` pattern (kicker line "3C WORLD GROUP - ONBOARDING", large `.portal-display` heading with the candidate's name, short intro) — copy the pattern inline rather than importing portal-shell components (this page is pre-auth; no `PortalHeader`/`PortalSidebar`).
  - Checklist sections: numbered section labels like `MemberLineSectionIndex`, item rows styled like the member-line board (same border/radius/typography rhythm), status chips in the portal chip style rather than default shadcn `Badge` grays.
  - Keep every state honest: loading skeleton, invalid/expired token, submit success/failure must all be restyled, none removed. Must look complete with zero animation (`.portal-enter` classes are progressive enhancement only).
- [ ] **Step 2: Gates**: `npx vitest run`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 3: Visual verification (controller, not subagent):** screenshots at 1440 and 390 of: token page loading, checklist with mixed statuses, invalid-token state. Compare against `/portal/onboarding` and dashboard for idiom match.
- [ ] **Step 4: Commit**: `git add "src/app/onboard/[token]/page.tsx" && git commit -m "feat(onboarding): restyle public invite page to portal design language"`

---

### Task 8: Full gates, adversarial review, ledger

- [ ] `npx vitest run` (expect 572 + all new tests), `npx tsc --noEmit`, eslint, `npm run build` — all clean.
- [ ] Fresh Opus adversarial review of the whole diff (`git diff <pre-plan-HEAD>..HEAD`) against the spec, with emphasis on: webhook remains sole approval writer; `esignSigningUrl` never reaches a non-owner (check the GET mapping AND any client logging); embedded flow failure paths (script blocked, URL stale, decline) all end in visible UI + alert, never silence; argument-sensitivity of every new test stub.
- [ ] Fix round(s) until review passes; commit each round.
- [ ] Update `docs/redesign/RESUME.md` and `.superpowers/sdd/progress.md` (commit ranges, deferred items).
- [ ] Report to Jacob: what shipped, what cannot be verified locally (real SignWell embedded envelope end-to-end; Postmark sender in production) and that the live test signature after deploy covers both.
