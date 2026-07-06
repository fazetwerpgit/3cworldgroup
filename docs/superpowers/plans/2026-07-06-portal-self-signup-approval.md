# Portal Self-Signup with Admin Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people self-register for the portal; new accounts are `pending` and see an approval screen until an admin makes them `active`, with the gate enforced in `firestore.rules`.

**Architecture:** Client-side signup (`createUserWithEmailAndPassword` + a self-written `users/{uid}` doc with `status:"pending"`), an `AuthContext.signUp` method + `pendingApproval` state that routes pending users to a screen, and a `firestore.rules` `isApproved()` gate (`status == "active"`) on every client-readable collection. Reuse `"active"` as the approved value — no migration, no lockout.

**Tech Stack:** Next.js (App Router), TypeScript, React client components, Firebase client Auth + Firestore, Vitest, Tailwind.

## Global Constraints

- Approved value is `status == "active"` (NOT a new `"approved"` literal). New signups write `status: "pending"`.
- Self-created `users/{uid}` doc contains EXACTLY `{ email, status: "pending", createdAt: serverTimestamp() }` — no other fields.
- Rules: a user may `create` only their own `users/{uid}` doc, only with `status == "pending"` and only those 3 keys. `update`/`delete` on `users/{uid}` are `if false` for clients (approval is Admin-SDK-only). No client write can set `status: "active"`.
- Every client-readable data collection requires `isApproved()`. Server-only (`if false`) collections are unchanged.
- Do NOT touch: the public marketing site, `/apply` (`applications`), or the recruit/onboarding-invite flow (`onboardingInvites`, `candidateOnboarding`, `recruiting/convert`, `public/onboarding/[token]`). Leave `api/portal/auth/signup/route.ts` disabled.
- Keep v3 tokens: navy `#0A1F44`, lime `#8dc63f` / `#5a8f1f`, `portal-*` classes.
- Test runner: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.
- **Ship gate:** `firebase deploy --only firestore:rules` (user-approved; CLI authed to `cworldgroup-cca68`) before the gate is live.

---

### Task 1: Signup validation helper

**Files:**
- Create: `src/lib/auth/signupValidation.ts`
- Create: `src/lib/auth/signupValidation.test.ts`

**Interfaces:**
- Produces: `validateSignup(email: string, password: string): { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/signupValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateSignup } from './signupValidation';

describe('validateSignup', () => {
  it('accepts a valid email + 6+ char password', () => {
    expect(validateSignup('rep@3cworldgroup.com', 'secret1').ok).toBe(true);
  });
  it('rejects an empty email', () => {
    expect(validateSignup('', 'secret1')).toEqual({ ok: false, error: 'Enter your email address.' });
  });
  it('rejects an email with no @', () => {
    expect(validateSignup('nope', 'secret1')).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });
  it('rejects a short password', () => {
    expect(validateSignup('rep@x.com', '123')).toEqual({ ok: false, error: 'Password must be at least 6 characters.' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/signupValidation.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/auth/signupValidation.ts`:

```ts
// Client-side pre-checks for the signup form. Firebase enforces its own rules
// server-side; this is for instant, friendly feedback.
export function validateSignup(
  email: string,
  password: string
): { ok: true } | { ok: false; error: string } {
  const e = email.trim();
  if (!e) return { ok: false, error: 'Enter your email address.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth/signupValidation.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/signupValidation.ts src/lib/auth/signupValidation.test.ts
git commit -m "feat(auth): signup validation helper"
```

---

### Task 2: AuthContext — signUp + pendingApproval + status branch

**Files:**
- Modify: `src/types/auth.ts` (`AuthState`, ~line 165-169)
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Produces: `AuthState.pendingApproval: boolean`; `AuthContextType.signUp(email, password): Promise<void>`; `pendingApproval` exposed from `useAuth()`.
- Consumed by: Task 3 (`signUp`), Task 4 (`pendingApproval`).

- [ ] **Step 1: Add `pendingApproval` to `AuthState`**

In `src/types/auth.ts`, change `AuthState`:

```ts
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  // True after a pending (unapproved) account signs in or signs up — the entry
  // page shows the "pending approval" screen instead of the login form.
  pendingApproval: boolean;
}
```

- [ ] **Step 2: Update imports + context type + initial state**

In `src/contexts/AuthContext.tsx`:
- Extend the `firebase/auth` import to add `createUserWithEmailAndPassword`.
- Extend the `firebase/firestore` import to add `setDoc` and `serverTimestamp`: `import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';`
- Add `useRef` to the react import.
- Add to `AuthContextType`: `signUp: (email: string, password: string) => Promise<void>;` and `clearPendingApproval: () => void;`
- Change the initial state to include `pendingApproval: false`:

```ts
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    pendingApproval: false,
  });

  // While a client-side signup is running, ignore onAuthStateChanged churn so
  // signUp() deterministically owns the final state (avoids a create→setDoc race).
  const signingUp = useRef(false);
```

- [ ] **Step 3: Refine the `onAuthStateChanged` status branch**

Replace the body of the `onAuthStateChanged` callback (the whole `if (firebaseUser) { ... } else { ... }`) with:

```ts
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (signingUp.current) return; // signUp() owns state during signup
      if (firebaseUser) {
        const userData = await fetchUserData(firebaseUser);
        if (userData) {
          if (userData.status === 'active') {
            setState({ user: userData, loading: false, error: null, pendingApproval: false });
          } else if (userData.status === 'pending') {
            if (auth) await firebaseSignOut(auth);
            setState({ user: null, loading: false, error: null, pendingApproval: true });
          } else {
            if (auth) await firebaseSignOut(auth);
            setState({
              user: null,
              loading: false,
              error: 'Your account has been deactivated. Please contact an administrator.',
              pendingApproval: false,
            });
          }
        } else {
          setState({
            user: null,
            loading: false,
            error: 'User profile not found. Please contact an administrator.',
            pendingApproval: false,
          });
        }
      } else {
        // Preserve pendingApproval so the pending screen survives the sign-out.
        setState((prev) => ({ ...prev, user: null, loading: false, error: null }));
      }
    });
```

- [ ] **Step 4: Add the `signUp` method**

Add after `signIn` (before `signOut`):

```ts
  const signUp = async (email: string, password: string) => {
    if (!auth || !db) throw new Error('auth/not-configured');
    signingUp.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      await firebaseSignOut(auth);
      setState({ user: null, loading: false, error: null, pendingApproval: true });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    } finally {
      signingUp.current = false;
    }
  };

  // Let the pending screen return to the login form without a page reload.
  const clearPendingApproval = () => {
    setState((prev) => ({ ...prev, pendingApproval: false }));
  };
```

- [ ] **Step 5: Expose `signUp` + `clearPendingApproval` in the provider value**

Add `signUp,` and `clearPendingApproval,` to the `value={{ ...state, signIn, signUp, clearPendingApproval, signOut, ... }}` object. (`pendingApproval` is already spread via `...state`.)

- [ ] **Step 6: Typecheck + build + commit**

Run: `npx tsc --noEmit` → clean (Task 3/4 consume the new members; a temporary "unused" is fine, but tsc should pass). Run: `npm run build` → succeeds.

```bash
git add src/types/auth.ts src/contexts/AuthContext.tsx
git commit -m "feat(auth): signUp + pendingApproval gate in AuthContext"
```

---

### Task 3: Shared auth shell + signup form + page + login link

**Files:**
- Create: `src/lib/auth/friendlyAuthError.ts`
- Create: `src/components/auth/AuthShell.tsx`
- Create: `src/components/auth/SignupForm.tsx`
- Create: `src/app/portal/signup/page.tsx`
- Modify: `src/components/auth/LoginForm.tsx` (use shared `friendlyAuthError`; add "Create an account" link)

**Interfaces:**
- Consumes: `useAuth().signUp` (Task 2); `validateSignup` (Task 1).
- Produces: `friendlyAuthError(err): string`; `AuthShell({ children })`.

- [ ] **Step 1: Extract the shared error mapper**

Create `src/lib/auth/friendlyAuthError.ts` (move the function currently inside `LoginForm.tsx`):

```ts
// Turn Firebase auth error codes into plain-language, actionable messages.
export function friendlyAuthError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const raw = err instanceof Error ? err.message : '';
  const c = `${code} ${raw}`;
  if (c.includes('email-already-in-use')) return 'An account with this email already exists. Try signing in instead.';
  if (c.includes('weak-password')) return 'Password is too weak. Use at least 6 characters.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Invalid email or password. Please try again.';
  if (c.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (c.includes('user-disabled')) return 'This account has been disabled. Contact your manager.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Wait a minute, then try again.';
  if (c.includes('network-request-failed')) return 'Network problem. Check your connection and try again.';
  if (c.includes('popup-closed-by-user') || c.includes('cancelled-popup-request')) return 'Sign-in was cancelled.';
  if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups and try again.';
  if (c.includes('account-exists-with-different-credential'))
    return 'This email already uses a password. Sign in with your email and password below.';
  if (c.includes('not-configured')) return 'Sign-in isn’t configured. Contact your administrator.';
  return 'Something went wrong. Please try again.';
}
```

- [ ] **Step 2: Point LoginForm at the shared mapper**

In `src/components/auth/LoginForm.tsx`: delete the local `function friendlyAuthError(...) { ... }` and add `import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';`. (The `GoogleIcon` function stays.) No other logic changes.

- [ ] **Step 3: Add the "Create an account" link in LoginForm**

In `src/components/auth/LoginForm.tsx`, replace the line:

```tsx
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Need an account? Contact your manager.
          </p>
```

with:

```tsx
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Need an account?{' '}
            <Link href="/portal/signup" className="font-medium text-[#5a8f1f] hover:underline dark:text-[#9fd44f]">
              Create one
            </Link>
          </p>
```

(`Link` from `next/link` is already imported in LoginForm.)

- [ ] **Step 4: Create the shared AuthShell**

Create `src/components/auth/AuthShell.tsx` by extracting LoginForm's outer brand-deck markup. It renders the navy/lime deck on the left and centers `children` (the panel) on the right:

```tsx
'use client';

import Image from 'next/image';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0b1424]">
      <div className="absolute inset-0 lg:w-[56%]">
        <div
          className="absolute inset-0 bg-[#8dc63f] max-lg:hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 110px) 100%, 0 100%)' }}
        />
        <div
          className="absolute inset-0 bg-[#0A1F44] lg:[clip-path:polygon(0_0,calc(100%_-_6px)_0,calc(100%_-_116px)_100%,0_100%)]"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 45% at 18% 92%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <div className="flex flex-col justify-between px-6 pb-10 pt-8 text-white sm:px-10 lg:min-h-screen lg:w-[56%] lg:px-14 lg:pb-14 lg:pt-12 lg:pr-40">
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
              <Image src="/logo.png" alt="3C World Group" width={30} height={30} priority className="h-[30px] w-[30px] object-contain" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide">3C World Group</p>
              <p className="text-xs text-white/50">Employee Portal</p>
            </div>
          </div>

          <div className="my-10 max-w-xl lg:my-0">
            <h2 className="portal-display animate-fade-in-up text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The day starts
              <br />
              <span className="text-[#8dc63f]">here.</span>
            </h2>
            <p className="animate-fade-in-up delay-200 mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
              Your numbers, your team, your next move — all in one place.
            </p>
          </div>

          <div className="animate-fade-in-up delay-300 hidden flex-wrap items-center gap-x-6 gap-y-2 lg:flex">
            {['Live leaderboard', 'Team chat', 'Sales pipeline'].map((item) => (
              <span key={item} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8dc63f]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-6 pb-16 sm:px-10 lg:items-center lg:px-14">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-lg shadow-black/20 dark:border-white/10 dark:bg-[#0e1c33] sm:p-8 lg:max-w-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-transparent">
            <div className="flex justify-center lg:block">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the SignupForm**

Create `src/components/auth/SignupForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { validateSignup } from '@/lib/auth/signupValidation';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';

const inputClasses =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#8dc63f] focus:ring-2 focus:ring-[#8dc63f]/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400';

export function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateSignup(email, password);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      // AuthContext set pendingApproval; go to /portal, which renders the
      // pending-approval screen (this page only knows how to show the form).
      router.push('/portal');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm animate-fade-in-up">
        <p className="portal-label">Employee portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A manager approves new accounts before access.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="signup-email" className="portal-label mb-2 block">Email address</label>
            <input
              type="email"
              id="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
              placeholder="you@3cworldgroup.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="portal-label mb-2 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClasses} pr-11`}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="portal-motion h-11 w-full rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link href="/portal" className="font-medium text-[#5a8f1f] hover:underline dark:text-[#9fd44f]">
            Sign in
          </Link>
        </p>

        <div className="mt-10 text-center lg:text-left">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to main site
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
```

- [ ] **Step 6: Create the signup page**

Create `src/app/portal/signup/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/portal/dashboard');
  }, [user, loading, router]);

  if (user) return null;
  return <SignupForm />;
}
```

- [ ] **Step 7: Typecheck + lint + build**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint src/components/auth/SignupForm.tsx src/components/auth/AuthShell.tsx src/app/portal/signup/page.tsx src/components/auth/LoginForm.tsx src/lib/auth/friendlyAuthError.ts` → clean.
Run: `npm run build` → succeeds (`/portal/signup` registered).

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/friendlyAuthError.ts src/components/auth/AuthShell.tsx src/components/auth/SignupForm.tsx src/app/portal/signup/page.tsx src/components/auth/LoginForm.tsx
git commit -m "feat(auth): self-signup page + shared auth shell/error mapper"
```

---

### Task 4: Pending-approval screen + wire into the entry page

**Files:**
- Create: `src/components/auth/PendingApproval.tsx`
- Modify: `src/app/portal/page.tsx`

**Interfaces:**
- Consumes: `AuthShell`; `useAuth().pendingApproval`.

- [ ] **Step 1: Create the PendingApproval screen**

Create `src/components/auth/PendingApproval.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';

export function PendingApproval() {
  const { clearPendingApproval } = useAuth();
  return (
    <AuthShell>
      <div className="w-full max-w-sm animate-fade-in-up">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#8dc63f]/15 text-[#5a8f1f] dark:text-[#9fd44f]">
          <Clock className="h-5 w-5" />
        </span>
        <p className="portal-label mt-5">Employee portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Account pending approval</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Your account was created and is waiting for a manager to approve it. You’ll be able to sign in once it’s approved — no need to sign up again.
        </p>

        <div className="mt-8">
          <button
            type="button"
            onClick={clearPendingApproval}
            className="portal-motion inline-flex h-11 w-full items-center justify-center rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e]"
          >
            Back to sign in
          </button>
        </div>

        <div className="mt-10 text-center lg:text-left">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to main site
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Wire it into the entry page**

In `src/app/portal/page.tsx`, pull `pendingApproval` from `useAuth()` and render the screen before the login form. Change line 9 and the final render:

```tsx
  const { user, loading, pendingApproval } = useAuth();
```

and replace the final `return <LoginForm />;` with:

```tsx
  if (pendingApproval) {
    return <PendingApproval />;
  }

  return <LoginForm />;
```

Add the import: `import { PendingApproval } from '@/components/auth/PendingApproval';`

- [ ] **Step 3: Typecheck + lint + build + commit**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint "src/app/portal/page.tsx" src/components/auth/PendingApproval.tsx` → clean. Run: `npm run build` → succeeds.

```bash
git add src/components/auth/PendingApproval.tsx "src/app/portal/page.tsx"
git commit -m "feat(auth): pending-approval screen for unapproved accounts"
```

---

### Task 5: firestore.rules — the security gate

**Files:**
- Modify: `firestore.rules` (replace whole file)

**Interfaces:**
- Produces: `isApproved()` gate on client-readable collections; self-create-only-pending on `users/{uid}`.

- [ ] **Step 1: Replace `firestore.rules`**

Replace the ENTIRE file with (this preserves every existing collection, adds `isApproved()`, tightens `users`, and gates client-readable collections):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Is the signed-in caller a back-office or field-management user?
    function isManagement() {
      let u = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return u.role in ['admin', 'operations'] ||
             u.fieldRole in ['l1_manager', 'l2_manager'];
    }

    // Is the signed-in caller an APPROVED (active) user? Self-signups are
    // status 'pending' and fail this until an admin flips them to 'active'
    // (Admin SDK / Console, which bypass rules).
    function isApproved() {
      return request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active';
    }

    // A user may create ONLY their own profile, ONLY pending, ONLY these 3
    // fields. No client update/delete — approval + edits go through the Admin
    // SDK. Self-read is allowed at any status so the pending screen can load.
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId
        && request.resource.data.status == 'pending'
        && request.resource.data.keys().hasOnly(['email', 'status', 'createdAt']);
      allow update, delete: if false;
    }

    // Admin/ops can read all users.
    match /users/{userId} {
      allow read: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'operations'];
    }

    // Per-user chat read receipts (client-written). Approved users only.
    match /users/{userId}/chatReads/{channelId} {
      allow read: if isApproved() && request.auth.uid == userId;
      allow write: if isApproved() && request.auth.uid == userId &&
        request.resource.data.keys().hasOnly(['lastReadAt']) &&
        request.resource.data.lastReadAt is timestamp;
    }

    match /sales/{saleId} {
      allow read: if isApproved();
      allow create: if isApproved();
      allow update, delete: if isApproved();
    }

    match /notifications/{notifId} {
      allow read, update: if isApproved();
      allow create: if isApproved();
    }

    match /training/{docId} {
      allow read: if isApproved();
      allow write: if isApproved();
    }

    match /userProgress/{docId} {
      allow read, write: if isApproved();
    }

    match /leaderboard/{docId} {
      allow read: if isApproved();
      allow write: if isApproved();
    }

    match /userOnboarding/{docId} {
      allow read: if isApproved() &&
        (resource.data.userId == request.auth.uid || isManagement());
      allow write: if false;
    }

    match /userChannelOnboarding/{docId} {
      allow read: if isApproved() &&
        (resource.data.userId == request.auth.uid || isManagement());
      allow write: if false;
    }

    match /onboardingInvites/{docId} {
      allow read, write: if false;
    }
    match /candidateOnboarding/{docId} {
      allow read, write: if false;
    }
    match /userSensitive/{uid} {
      allow read, write: if false;
    }
    match /sensitiveAccessLog/{logId} {
      allow read, write: if false;
    }
    match /fiberReports/{id} {
      allow read, write: if false;
    }
    match /expediteOrders/{id} {
      allow read, write: if false;
    }
    match /payrollDisputes/{id} {
      allow read, write: if false;
    }
    match /leadsRequests/{id} {
      allow read, write: if false;
    }
    match /formOptions/{key} {
      allow read, write: if false;
    }
    match /managerInterviews/{id} {
      allow read, write: if false;
    }
    match /bugReports/{id} {
      allow read, write: if false;
    }
    match /formAlerts/{key} {
      allow read, write: if false;
    }

    match /chatChannels/{channelId} {
      allow read: if isApproved() && request.auth.uid in resource.data.memberIds;
      allow write: if false;
    }

    match /chatChannels/{channelId}/messages/{messageId} {
      allow read: if isApproved() &&
        request.auth.uid in get(/databases/$(database)/documents/chatChannels/$(channelId)).data.memberIds;
      allow write: if false;
    }

    match /chatChannels/{channelId}/messages/{messageId}/reactions/{reactionId} {
      allow read: if isApproved() &&
        request.auth.uid in get(/databases/$(database)/documents/chatChannels/$(channelId)).data.memberIds;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Compile-check the rules**

Run: `npx firebase deploy --only firestore:rules --dry-run 2>&1 | tail -5`
Expected: `compiled successfully`. (Do NOT actually deploy — that's a controller ship gate after all tasks + review.)

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(auth): firestore approval gate — pending self-create, approved-only data access"
```

---

### Task 6: Full verification

- [ ] **Step 1: Test suite**

Run: `npm run test` → all pass (incl. new `signupValidation` tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build` → both clean; `/portal/signup` registered.

- [ ] **Step 3: Manual smoke (against deployed rules — controller deploys first)**

1. `/portal/signup`: create an account → lands on "Account pending approval", signed out.
2. Firestore: the new `users/{uid}` doc is `status: "pending"` with only `email`, `status`, `createdAt`.
3. Try to sign in as the pending user → pending screen again (no portal).
4. Admin flips the user to `active` (admin Users page) → the user can sign in and use the portal.
5. An existing `active` user still has full access (sales/chat/training) — confirms no lockout.

---

## Notes / deferred
- The `firestore.rules` deploy is a required ship gate; the gate is inert until deployed, and existing `active` users are unaffected.
- Email verification, signup rate-limiting, admin new-signup notifications, and a dedicated pending-signups admin queue are out of scope (admins approve via the existing Users page, filtered by status).
- `AuthShell` is shared by SignupForm + PendingApproval; LoginForm keeps its own inline shell (untouched beyond the link + shared error import) to avoid churning the just-shipped login page.
