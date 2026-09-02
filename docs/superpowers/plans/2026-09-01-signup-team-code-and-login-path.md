# Signup Team Code + Easy Login Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a shared team code at portal self-signup so job applicants stop creating accounts, steer applicants away with copy, add short login URLs, and nudge iPhone reps to install the portal to their home screen.

**Architecture:** The signup form gets a new required "Team code" field that is verified server-side by a tiny API route (same shape as the existing reCAPTCHA route) before the client creates the Firebase account. Copy on signup and login pages changes. Three redirects are added in `next.config.ts`. A self-contained banner component with a pure visibility predicate is mounted at the top of the dashboard.

**Tech Stack:** Next.js 15 App Router (TypeScript), Firebase Auth client SDK, vitest (node environment, `src/**/*.test.{ts,tsx}`), Tailwind utility classes plus the existing `member-line-*` CSS classes in `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-01-signup-team-code-and-login-path-design.md`

## Global Constraints

- Team code env var name is exactly `PORTAL_TEAM_CODE`; initial value `3cteam`; matching is case-insensitive and trims whitespace; missing env var fails closed.
- Wrong-code error copy, verbatim: `That team code isn't right. Ask your manager for the current one.`
- New `users/{uid}` field on self-signup: `signupMethod: 'team_code'`.
- Copy strings in Part 2 of the spec are verbatim; do not paraphrase.
- Redirects: `/login`, `/signin`, `/employee` → `/portal`, permanent.
- Banner localStorage key is exactly `a2hs-dismissed`; every localStorage read/write is wrapped in try/catch and any error means the banner does not render.
- Do not touch the recruiting invite flow (`/onboard/[token]`), admin user creation, or `PendingApproval.tsx`.
- No emojis in code or copy. Commit messages end with the Claude Fable co-author trailer used elsewhere in this repo.
- Gates before declaring done: `npx tsc --noEmit` and `npm run build` both exit 0.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/auth/teamCode.ts` | Create | Pure `isValidTeamCode(input, expected)` comparison. No I/O. |
| `src/lib/auth/teamCode.test.ts` | Create | Unit tests for the comparison. |
| `src/app/api/portal/auth/team-code/route.ts` | Create | POST `{ code }` → `{ ok }`; reads `PORTAL_TEAM_CODE`. |
| `src/contexts/AuthContext.tsx` | Modify | `signUp` writes `signupMethod: 'team_code'`. |
| `src/components/auth/SignupForm.tsx` | Modify | New field, server check before Firebase signup, copy changes, applicant callout. |
| `src/components/auth/LoginForm.tsx` | Modify | One line of link copy. |
| `next.config.ts` | Modify | Three permanent redirects. |
| `src/lib/pwa/addToHomeScreen.ts` | Create | Pure `shouldShowAddToHomeScreen({ userAgent, standalone, dismissed })`. |
| `src/lib/pwa/addToHomeScreen.test.ts` | Create | Unit tests for the predicate. |
| `src/components/portal/AddToHomeScreenBanner.tsx` | Create | Client component; reads UA/standalone/localStorage, renders banner. |
| `src/app/portal/dashboard/page.tsx` | Modify | Mount the banner at the top of the dashboard content. |
| `.env.local` | Modify | Add `PORTAL_TEAM_CODE=3cteam`. |

---

### Task 1: Team code verifier and API route

**Files:**
- Create: `src/lib/auth/teamCode.ts`
- Create: `src/lib/auth/teamCode.test.ts`
- Create: `src/app/api/portal/auth/team-code/route.ts`
- Modify: `.env.local` (append one line)

**Interfaces:**
- Produces: `isValidTeamCode(input: unknown, expected: string | undefined): boolean` in `src/lib/auth/teamCode.ts`.
- Produces: `POST /api/portal/auth/team-code` accepting JSON `{ code: string }` and returning HTTP 200 JSON `{ ok: boolean }`. Task 2 calls this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/teamCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidTeamCode } from './teamCode';

describe('isValidTeamCode', () => {
  it('accepts an exact match', () => {
    expect(isValidTeamCode('3cteam', '3cteam')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isValidTeamCode('3CTEAM', '3cteam')).toBe(true);
    expect(isValidTeamCode('3cTeam', '3CTEAM')).toBe(true);
  });

  it('trims surrounding whitespace from the input', () => {
    expect(isValidTeamCode('  3cteam \n', '3cteam')).toBe(true);
  });

  it('rejects a wrong code', () => {
    expect(isValidTeamCode('3cteams', '3cteam')).toBe(false);
    expect(isValidTeamCode('', '3cteam')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidTeamCode(undefined, '3cteam')).toBe(false);
    expect(isValidTeamCode(123, '3cteam')).toBe(false);
    expect(isValidTeamCode(null, '3cteam')).toBe(false);
  });

  it('fails closed when the expected code is unset or blank', () => {
    expect(isValidTeamCode('3cteam', undefined)).toBe(false);
    expect(isValidTeamCode('', '')).toBe(false);
    expect(isValidTeamCode('   ', '   ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/teamCode.test.ts`
Expected: FAIL with "Failed to resolve import './teamCode'" (module does not exist yet).

- [ ] **Step 3: Write the verifier**

Create `src/lib/auth/teamCode.ts`:

```ts
/**
 * Shared team code gate for portal self-signup.
 *
 * Managers hand this code to returning hires so they can register without a
 * recruiting invite. Job applicants who stumble onto /portal/signup do not
 * have it. Matching is case-insensitive and ignores surrounding whitespace.
 * An unset or blank expected code fails closed so a misconfigured deploy
 * never becomes an open signup.
 */
export function isValidTeamCode(input: unknown, expected: string | undefined): boolean {
  if (typeof input !== 'string') return false;
  const want = (expected ?? '').trim().toLowerCase();
  if (!want) return false;
  return input.trim().toLowerCase() === want;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/teamCode.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the API route**

Create `src/app/api/portal/auth/team-code/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isValidTeamCode } from '@/lib/auth/teamCode';

let warnedUnconfigured = false;

/**
 * POST { code } -> { ok }
 *
 * Verifies the shared signup team code against PORTAL_TEAM_CODE. Always
 * responds 200 so the client can branch on `ok` alone, mirroring
 * /api/portal/auth/captcha. Fails closed when the env var is missing.
 */
export async function POST(request: Request) {
  const expected = process.env.PORTAL_TEAM_CODE;
  if (!expected || !expected.trim()) {
    if (!warnedUnconfigured) {
      console.warn('PORTAL_TEAM_CODE is unset; portal self-signup is blocked until it is configured.');
      warnedUnconfigured = true;
    }
    return NextResponse.json({ ok: false });
  }

  try {
    const body = await request.json() as { code?: unknown };
    return NextResponse.json({ ok: isValidTeamCode(body.code, expected) });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
```

- [ ] **Step 6: Add the env var locally**

Append to `.env.local` (the file is gitignored; do not commit it):

```
PORTAL_TEAM_CODE=3cteam
```

Run: `grep -c '^PORTAL_TEAM_CODE=' .env.local`
Expected: `1`

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

```bash
git add src/lib/auth/teamCode.ts src/lib/auth/teamCode.test.ts src/app/api/portal/auth/team-code/route.ts
git commit -m "feat(auth): team code verifier + /api/portal/auth/team-code route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Signup form gate, copy, and signupMethod

**Files:**
- Modify: `src/contexts/AuthContext.tsx:25` (type) and `src/contexts/AuthContext.tsx:218-235` (signUp body)
- Modify: `src/components/auth/SignupForm.tsx` (steps constant at lines 65-69, state at 76-84, submit at 88-149, JSX at 175-263)

**Interfaces:**
- Consumes: `POST /api/portal/auth/team-code` from Task 1.
- Produces: `signUp(email, password, displayName)` signature is unchanged; the `users/{uid}` document now always includes `signupMethod: 'team_code'` for self-signup. (The recruiting invite path writes its own user doc server-side and is untouched.)

There are no component tests in this repo (vitest runs in the node environment with no DOM). This task is verified by typecheck plus a manual browser check in Step 6.

- [ ] **Step 1: Write signupMethod in AuthContext**

In `src/contexts/AuthContext.tsx`, inside `signUp`, change the `setDoc` call so the document includes the new field:

```ts
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          displayName,
          status: 'pending',
          signupMethod: 'team_code',
          createdAt: serverTimestamp(),
        });
```

No other change in this file.

- [ ] **Step 2: Update the steps constant and add state in SignupForm**

In `src/components/auth/SignupForm.tsx`, replace the `SIGNUP_STEPS` block (including its comment) with:

```ts
// Real 3-step structural fact describing the account flow (team code ->
// verify -> manager activates) — not measured data, same reasoning as
// Settings' static 5 (member-the-line-goal.md).
const SIGNUP_STEPS = [
  { n: 1, label: 'Enter your team code' },
  { n: 2, label: 'Verify your email' },
  { n: 3, label: 'Your manager activates your account' },
];

const TEAM_CODE_ERROR = "That team code isn't right. Ask your manager for the current one.";
```

Inside the `SignupForm` component, add one state hook directly after the `confirmPassword` state:

```ts
  const [teamCode, setTeamCode] = useState('');
```

- [ ] **Step 3: Gate submit on the team code**

In `handleSubmit`, immediately after the `looksLikeBotSignup` block and before `setError('');`, add:

```ts
    if (!teamCode.trim()) {
      setError(TEAM_CODE_ERROR);
      return;
    }
```

Then, after the whole `if (siteKey) { ... }` reCAPTCHA block and immediately before `await signUp(email.trim(), password, displayName.trim());`, add:

```ts
      try {
        const codeResponse = await fetch('/api/portal/auth/team-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: teamCode }),
        });
        const codeData = await codeResponse.json() as { ok?: unknown };
        if (!codeResponse.ok || codeData.ok !== true) {
          setError(TEAM_CODE_ERROR);
          return;
        }
      } catch {
        setError(TEAM_CODE_ERROR);
        return;
      }
```

Order matters: the reCAPTCHA check stays first so bots are rejected before they can probe the code.

- [ ] **Step 4: Update the form JSX and copy**

In the `<section className="member-line-form-card">` block, make these exact edits.

Replace the heading and subtitle:

```tsx
            <h2>Join with your team code</h2>
            <p>Your manager gave you a team code. Use an email you check regularly.</p>
```

Insert a new field between the email field's closing `</div>` and the password field's opening `<div className="member-line-field">`:

```tsx
              <div className="member-line-field">
                <label htmlFor="signup-team-code">Team code / required</label>
                <input
                  id="signup-team-code"
                  type="text"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>
```

Replace the submit button:

```tsx
              <button type="submit" className="member-line-button primary" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
```

Insert the applicant callout directly after the closing `</form>` tag and before `<div className="member-line-steps">`:

```tsx
            <p className="member-line-note" role="note">
              Applied for a job? You don&apos;t need an account yet. We&apos;ll reach out after we review your application.
            </p>
```

Also update the masthead intro sentence (the `<p className="member-line-intro">` near the top of the JSX) so it does not contradict the new flow:

```tsx
            <p className="member-line-intro">
              Enter your team code, verify your email, and your manager activates your account.
            </p>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Manual browser check**

Run: `npm run dev` and open `http://localhost:3000/portal/signup`.

Check:
1. The page shows "Join with your team code", a "Team code / required" field between email and password, a "Create account" button, the applicant callout under the form, and steps "Enter your team code / Verify your email / Your manager activates your account".
2. Submitting with team code `wrong` and otherwise valid data shows `That team code isn't right. Ask your manager for the current one.` and no account is created (check Firebase Auth or the Pending queue).
3. Submitting with `3CTEAM` (upper case) proceeds to the pending screen.

Stop the dev server. Delete any test account you created from Admin → Users.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.tsx src/components/auth/SignupForm.tsx
git commit -m "feat(auth): require team code at portal self-signup; steer applicants away

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Login page link copy

**Files:**
- Modify: `src/components/auth/LoginForm.tsx:296-301`

**Interfaces:** none.

- [ ] **Step 1: Change the copy**

Replace the paragraph:

```tsx
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Have a team code?{' '}
            <Link href="/portal/signup" className="font-medium text-[#5a8f1f] hover:underline dark:text-[#9fd44f]">
              Create your account
            </Link>
          </p>
```

- [ ] **Step 2: Verify and commit**

Run: `grep -n "Have a team code" src/components/auth/LoginForm.tsx`
Expected: one match.

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/components/auth/LoginForm.tsx
git commit -m "copy(login): point 'create account' link at team-code signup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Short login URLs

**Files:**
- Modify: `next.config.ts`

**Interfaces:** none.

- [ ] **Step 1: Add redirects**

Replace the whole file with:

```ts
import type { NextConfig } from "next";

// Short, memorable URLs managers can text to reps. /portal renders the login
// form when signed out and forwards to the dashboard when signed in.
const LOGIN_ALIASES = ['/login', '/signin', '/employee'];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/**': ['assets/esign/**'],
  },
  async redirects() {
    return LOGIN_ALIASES.map((source) => ({
      source,
      destination: '/portal',
      permanent: true,
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '3cworldgroup.com',
        pathname: '/wp-content/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the redirects locally**

Run: `npm run dev` in the background, wait for "Ready", then:

```bash
for p in login signin employee; do
  printf '%s -> ' "/$p"
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:3000/$p"
done
```

Expected, each line: `308 http://localhost:3000/portal`

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: /login, /signin, /employee redirect to the portal login

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Add-to-home-screen predicate

**Files:**
- Create: `src/lib/pwa/addToHomeScreen.ts`
- Create: `src/lib/pwa/addToHomeScreen.test.ts`

**Interfaces:**
- Produces: `shouldShowAddToHomeScreen(input: { userAgent: string; standalone: boolean; dismissed: boolean }): boolean` and `isIosSafari(userAgent: string): boolean`. Task 6 consumes both.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pwa/addToHomeScreen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isIosSafari, shouldShowAddToHomeScreen } from './addToHomeScreen';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

describe('isIosSafari', () => {
  it('matches iPhone and iPad Safari', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPAD_SAFARI)).toBe(true);
  });

  it('rejects third-party iOS browsers', () => {
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX)).toBe(false);
  });

  it('rejects desktop Safari and Android', () => {
    expect(isIosSafari(MAC_SAFARI)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
  });
});

describe('shouldShowAddToHomeScreen', () => {
  it('shows on iPhone Safari when not installed and not dismissed', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: false })).toBe(true);
  });

  it('hides when already running as an installed app', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: true, dismissed: false })).toBe(false);
  });

  it('hides when the user dismissed it', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: true })).toBe(false);
  });

  it('hides everywhere that is not iOS Safari', () => {
    expect(shouldShowAddToHomeScreen({ userAgent: IPHONE_CHROME, standalone: false, dismissed: false })).toBe(false);
    expect(shouldShowAddToHomeScreen({ userAgent: MAC_SAFARI, standalone: false, dismissed: false })).toBe(false);
    expect(shouldShowAddToHomeScreen({ userAgent: ANDROID_CHROME, standalone: false, dismissed: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pwa/addToHomeScreen.test.ts`
Expected: FAIL with "Failed to resolve import './addToHomeScreen'".

- [ ] **Step 3: Write the predicate**

Create `src/lib/pwa/addToHomeScreen.ts`:

```ts
/**
 * Decides whether to show the "Add to Home Screen" nudge.
 *
 * Only iOS Safari can install a web app from the Share sheet, so the banner
 * is pointless (and confusing) anywhere else. Third-party iOS browsers
 * (Chrome = CriOS, Firefox = FxiOS, Edge = EdgiOS, Opera = OPT) wrap WebKit
 * but do not offer Add to Home Screen, so they are excluded too.
 */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent;
  const isIosDevice = /iPhone|iPad|iPod/.test(ua);
  if (!isIosDevice) return false;
  const isThirdParty = /CriOS|FxiOS|EdgiOS|OPT\//.test(ua);
  if (isThirdParty) return false;
  return /Safari/.test(ua);
}

export interface AddToHomeScreenInput {
  userAgent: string;
  /** window.navigator.standalone — true when launched from the home screen icon. */
  standalone: boolean;
  /** true when localStorage['a2hs-dismissed'] is set. */
  dismissed: boolean;
}

export function shouldShowAddToHomeScreen(input: AddToHomeScreenInput): boolean {
  if (input.standalone) return false;
  if (input.dismissed) return false;
  return isIosSafari(input.userAgent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pwa/addToHomeScreen.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/addToHomeScreen.ts src/lib/pwa/addToHomeScreen.test.ts
git commit -m "feat(pwa): add-to-home-screen visibility predicate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Banner component mounted on the dashboard

**Files:**
- Create: `src/components/portal/AddToHomeScreenBanner.tsx`
- Modify: `src/app/portal/dashboard/page.tsx` (import block at top; root JSX at line 548 onward)

**Interfaces:**
- Consumes: `shouldShowAddToHomeScreen` from Task 5.
- Produces: `<AddToHomeScreenBanner />` default-exported client component with no props.

- [ ] **Step 1: Write the component**

Create `src/components/portal/AddToHomeScreenBanner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { shouldShowAddToHomeScreen } from '@/lib/pwa/addToHomeScreen';

const DISMISSED_KEY = 'a2hs-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Storage unavailable (private mode, blocked site data). Treat as
    // dismissed so we never render without a way to remember the choice.
    return true;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Ignore; the banner is hidden for this page view regardless.
  }
}

/**
 * One-time nudge for iPhone Safari users to install the portal to their home
 * screen. Rendering is decided on the client after mount so SSR never sees
 * navigator/localStorage. Never shows inside the installed app.
 */
export default function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setVisible(
      shouldShowAddToHomeScreen({
        userAgent: nav.userAgent ?? '',
        standalone: nav.standalone === true,
        dismissed: readDismissed(),
      }),
    );
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Add 3C Console to your home screen"
      className="mb-4 flex items-start gap-3 rounded-lg border border-[#0A1F44]/[.14] bg-white px-4 py-3 text-[#0A1F44] shadow-sm dark:border-white/[.12] dark:bg-white/[.04] dark:text-[#f4f7fa]"
    >
      <Share className="mt-0.5 size-5 shrink-0 text-[#5a8f1f] dark:text-[#9fd44f]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Add 3C Console to your home screen</p>
        <p className="mt-0.5 text-sm text-[#0A1F44]/75 dark:text-[#f4f7fa]/75">
          Tap the Share button, then Add to Home Screen. You&apos;ll get an app icon that opens straight to the portal.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 rounded-md bg-[#0A1F44] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#153c74] dark:bg-[#9fd44f] dark:text-[#0A1F44] dark:hover:bg-[#b5e06a]"
        >
          Got it
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-[#0A1F44]/60 hover:text-[#0A1F44] dark:text-[#f4f7fa]/60 dark:hover:text-[#f4f7fa]"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it on the dashboard**

In `src/app/portal/dashboard/page.tsx`, add to the import block (after the `Skeleton` import):

```ts
import AddToHomeScreenBanner from '@/components/portal/AddToHomeScreenBanner';
```

Then inside `DashboardPage`'s root JSX, find the inner content wrapper:

```tsx
      <div aria-label={`${roleLabel} dashboard`} className="relative z-10 mx-auto w-full max-w-[1180px] px-[clamp(14px,4vw,58px)] pb-[42px] pt-[19px] max-[430px]:px-3">
```

and insert `<AddToHomeScreenBanner />` as its first child, on the line immediately after that opening tag.

- [ ] **Step 3: Typecheck and run all tests**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: all tests pass, including the two new files.

- [ ] **Step 4: Manual check in a desktop browser**

Run: `npm run dev`, sign in, open `/portal/dashboard`.

Check: no banner appears on desktop (predicate rejects the desktop UA).

In the browser devtools, switch device emulation to an iPhone and reload. Check: the banner appears at the top of the dashboard with the title, the two-step instruction, and a "Got it" button. Click "Got it". Reload. Check: the banner does not return. Run in the console:

```js
localStorage.removeItem('a2hs-dismissed')
```

Reload. Check: the banner returns. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/AddToHomeScreenBanner.tsx src/app/portal/dashboard/page.tsx
git commit -m "feat(portal): one-time add-to-home-screen banner on the dashboard (iOS Safari)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Production gates, Vercel env, handoff note

**Files:**
- Modify: `docs/redesign/RESUME.md` (portal ops section)

**Interfaces:** none.

- [ ] **Step 1: Run the gates**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0, and the build output lists `/api/portal/auth/team-code` as a dynamic route.

- [ ] **Step 2: Set the Vercel env var**

Run each (the Vercel CLI is already authenticated on this machine):

```bash
printf '3cteam' | npx vercel env add PORTAL_TEAM_CODE production
printf '3cteam' | npx vercel env add PORTAL_TEAM_CODE preview
printf '3cteam' | npx vercel env add PORTAL_TEAM_CODE development
```

Verify:

```bash
npx vercel env ls | grep PORTAL_TEAM_CODE
```

Expected: three rows (production, preview, development).

- [ ] **Step 3: Update the handoff**

In `docs/redesign/RESUME.md`, under "DONE this session" in the PORTAL OPS TRACK section, add:

```
- Signup team code gate + easy login path implemented on branch
  onboarding/completion (spec docs/superpowers/specs/2026-09-01-signup-team-code-and-login-path-design.md).
  Code is 3cteam (case-insensitive), env PORTAL_TEAM_CODE set in Vercel (all
  envs) + .env.local. /login, /signin, /employee redirect to /portal. iOS
  Safari add-to-home-screen banner on the dashboard. Gates passed. NOT YET
  merged to master / deployed — next: cherry-pick or merge to master, push,
  verify on prod (wrong code blocked; /login redirects; banner on an iPhone).
```

- [ ] **Step 4: Commit**

```bash
git add docs/redesign/RESUME.md
git commit -m "docs: RESUME — team code gate + login path ready for merge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Part 1 (field, route, env, error copy, signupMethod, fail closed): Tasks 1 and 2. Part 2 (six copy strings): Task 2 covers title, subtitle, steps, button, callout; Task 3 covers the login link. Part 3 short URLs: Task 4. Banner rules (iOS Safari only, not standalone, localStorage key, try/catch, dashboard only, copy): Tasks 5 and 6. Testing section: unit tests in Tasks 1 and 5, manual checks in Tasks 2, 4, 6, gates in Task 7. Rollout step 1 (Vercel env): Task 7. Rollout steps 2 and 3 are Jacob's.

**Placeholders.** None. Every code step shows full code.

**Type consistency.** `isValidTeamCode(input: unknown, expected: string | undefined)` is used identically in Task 1's route. `shouldShowAddToHomeScreen({ userAgent, standalone, dismissed })` matches between Task 5 and Task 6. `AddToHomeScreenBanner` is a default export in Task 6 and imported as such.
