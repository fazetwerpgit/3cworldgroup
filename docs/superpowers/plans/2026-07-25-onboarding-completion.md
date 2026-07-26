# Onboarding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confine a rep who has not finished onboarding to their checklist plus a small welcome set, put every invitable role through that checklist, and make a failed e-signature impossible to fake.

**Architecture:** One shared allowlist module (`src/lib/auth/onboardingAccess.ts`) becomes the single source of truth for what an unfinished hire may reach; the portal guard, the navigation components and the server-side auth helper all read it, so client and server cannot drift. Separately, one predicate (`roleRequiresOnboarding`) is widened from a single role to all eight invitable field roles, which brings five already-built systems to life at once. Finally the e-sign auto-send records its failures on the item instead of only in a log, and the submit endpoint refuses typed references for signature items.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin SDK (server) and Web SDK (client), Firestore security rules, Vitest.

**A note on test code in this plan:** Tasks 1, 2 and 3 carry literal test code — write it as given. Tasks 4 and 8 enumerate exact behaviour cases instead, because their tests need mocking scaffolding specific to files this plan does not transcribe (`AuthContext`, `next/navigation`, `adminDb`). Follow the existing test-file idiom in the same directory. Every enumerated case is required; none is optional, and none may be dropped for being awkward to mock.

**Source spec:** `docs/superpowers/specs/2026-07-25-onboarding-completion-design.md` — read it if a task's intent is unclear. It records the client's four decisions and the conflict with the superseded 2026-07-09 spec.

## Global Constraints

- **DO NOT DEPLOY.** Local commits only. No `git push` (a push triggers a Vercel production deploy). No `firebase deploy`. The `firestore.rules` change is written and committed but NOT deployed.
- Work on branch `onboarding/completion`. Never commit to `master`.
- The eight invitable field roles, exactly: `entry_level_rep`, `entry_rep`, `l1_manager`, `l2_manager`, `ibo_level_1`, `ibo_level_2`, `ibo_level_3`, `ibo_level_4`. `general_manager`, `gm_in_training` and `office_manager` are NOT invitable and do NOT require onboarding.
- Allowed pages, exactly: `/portal/onboarding`, `/portal/chat`, `/portal/training`, `/portal/resources`, `/portal/calls`, `/portal/settings`.
- Allowed APIs, exactly: `/api/portal/onboarding`, `/api/portal/training`, `/api/portal/commission`, `/api/portal/calls`, `/api/portal/notifications`, `/api/portal/profile`, `/api/portal/presence`, `/api/portal/push/register`, `/api/portal/chat/channels`, `/api/portal/chat/channels/[channelId]/media`, `/api/portal/chat/channels/[channelId]/members`, `/api/portal/chat/gifs`, `/api/portal/chat/media`, `/api/portal/chat/messages`, `/api/portal/chat/messages/pin`, `/api/portal/chat/reactions`.
- Explicitly NOT allowed, and currently must be closed: `/api/portal/leaderboard`, `/api/portal/sales`, `/api/portal/sales/stats`. Also not allowed: `/api/portal/chat/channels/manage`, `/api/portal/chat/channels/sync`, `/api/portal/chat/channels/[channelId]/members/manage`.
- Path matching is segment-aware: `/portal/training` matches `/portal/training/abc` but must NOT match `/portal/trainingfoo`.
- The allowlist relaxes only the account-status check. It grants no permission a rep does not already hold.
- An unapproved self-signup (`pending` with no field role) and a deactivated account (`inactive`) are never admitted anywhere, by any mechanism in this plan.
- Do not touch the `requireVerifiedManagement` call in `src/app/api/portal/notifications/route.ts` (~line 126) — it is a deliberate management-only branch inside a rep-facing route.
- Gates for every task: `npx tsc --noEmit`, `npm test`, and eslint on changed files only. The repo has 26 pre-existing eslint errors in marketing pages and two chat hooks — do not fix them, and never report the repo as eslint-clean.
- `npm run build` is required at Task 9 only, not per task.
- Commit after each task with a conventional-commit message. Frequent commits.

---

### Task 1: The allowlist module

**Files:**
- Create: `src/lib/auth/onboardingAccess.ts`
- Create: `src/lib/auth/onboardingAccess.test.ts`

**Interfaces:**
- Consumes: `roleRequiresOnboarding` and `FieldRole` from `src/types/auth.ts` (current behaviour — Task 2 widens it; this module does not care which roles qualify).
- Produces: `ONBOARDING_ALLOWED_PAGES`, `ONBOARDING_ALLOWED_APIS`, `isOnboardingAllowedPage(pathname: string): boolean`, `isOnboardingAllowedApi(pathname: string): boolean`, `isOnboardingUser(user: { status?: string | null; fieldRole?: FieldRole | null } | null | undefined): boolean`. Tasks 3, 4 and 5 all import from here.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/onboardingAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ALLOWED_APIS,
  ONBOARDING_ALLOWED_PAGES,
  isOnboardingAllowedApi,
  isOnboardingAllowedPage,
  isOnboardingUser,
} from './onboardingAccess';

describe('isOnboardingAllowedPage', () => {
  it('allows every listed page', () => {
    for (const page of ONBOARDING_ALLOWED_PAGES) {
      expect(isOnboardingAllowedPage(page)).toBe(true);
    }
  });

  it('allows sub-paths of a listed page', () => {
    expect(isOnboardingAllowedPage('/portal/training/abc123')).toBe(true);
    expect(isOnboardingAllowedPage('/portal/chat/general')).toBe(true);
  });

  it('does not allow a page whose name merely starts with an allowed one', () => {
    expect(isOnboardingAllowedPage('/portal/trainingfoo')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/callsomething')).toBe(false);
  });

  it('blocks the pages the client excluded', () => {
    expect(isOnboardingAllowedPage('/portal/dashboard')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/leaderboard')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/sales')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/forms')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/admin')).toBe(false);
    expect(isOnboardingAllowedPage('/portal/admin/users')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(isOnboardingAllowedPage('/portal/chat/')).toBe(true);
  });
});

describe('isOnboardingAllowedApi', () => {
  it('allows every listed api', () => {
    for (const api of ONBOARDING_ALLOWED_APIS) {
      expect(isOnboardingAllowedApi(api)).toBe(true);
    }
  });

  it('allows sub-paths of a listed api', () => {
    expect(isOnboardingAllowedApi('/api/portal/onboarding/submit')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/onboarding/upload')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/training/progress')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/training/res-1')).toBe(true);
  });

  it('blocks the three routes that must close', () => {
    expect(isOnboardingAllowedApi('/api/portal/leaderboard')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/sales')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/sales/stats')).toBe(false);
  });

  it('blocks chat administration but allows chat participation', () => {
    expect(isOnboardingAllowedApi('/api/portal/chat/messages')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/reactions')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/manage')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/sync')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/c1/members')).toBe(true);
    expect(isOnboardingAllowedApi('/api/portal/chat/channels/c1/members/manage')).toBe(false);
  });

  it('blocks admin apis', () => {
    expect(isOnboardingAllowedApi('/api/portal/auth/users')).toBe(false);
    expect(isOnboardingAllowedApi('/api/portal/forms')).toBe(false);
  });
});

describe('isOnboardingUser', () => {
  it('is true for a pending hire holding a field role', () => {
    expect(isOnboardingUser({ status: 'pending', fieldRole: 'entry_level_rep' })).toBe(true);
  });

  it('is false for an unapproved self-signup with no field role', () => {
    expect(isOnboardingUser({ status: 'pending' })).toBe(false);
    expect(isOnboardingUser({ status: 'pending', fieldRole: null })).toBe(false);
  });

  it('is false for an active user', () => {
    expect(isOnboardingUser({ status: 'active', fieldRole: 'entry_level_rep' })).toBe(false);
  });

  it('is false for a deactivated user', () => {
    expect(isOnboardingUser({ status: 'inactive', fieldRole: 'entry_level_rep' })).toBe(false);
  });

  it('is false for null or undefined', () => {
    expect(isOnboardingUser(null)).toBe(false);
    expect(isOnboardingUser(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/onboardingAccess.test.ts`
Expected: FAIL — cannot resolve `./onboardingAccess`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/onboardingAccess.ts`. It must include a file-header comment explaining that this is the single source of truth and that adding a route means adding one line here. Implementation:

```ts
import { roleRequiresOnboarding, type FieldRole } from '@/types/auth';

// SINGLE SOURCE OF TRUTH for what a hire who has not finished onboarding may
// reach. Three consumers read these lists: the portal guard
// (components/portal/OnboardingGate.tsx), the navigation components, and the
// server-side status gate (lib/auth/requireVerifiedAdmin.ts). Adding a route a
// hire needs means adding ONE line here — nowhere else gets an opinion, which
// is what stops the client and the server drifting apart.
//
// Being listed relaxes ONLY the account-status check. It grants no permission a
// rep does not already hold, so an admin-only method on a listed path stays
// closed to a hire through its own role check.

export const ONBOARDING_ALLOWED_PAGES: readonly string[] = [
  '/portal/onboarding',
  '/portal/chat',
  '/portal/training',
  '/portal/resources',
  '/portal/calls',
  '/portal/settings',
];

// Chat is enumerated route by route rather than as a prefix: creating channels,
// syncing them and managing membership are administration and keep their own
// management gates.
export const ONBOARDING_ALLOWED_APIS: readonly string[] = [
  '/api/portal/onboarding',
  '/api/portal/training',
  '/api/portal/commission',
  '/api/portal/calls',
  '/api/portal/notifications',
  '/api/portal/profile',
  '/api/portal/presence',
  '/api/portal/push/register',
  '/api/portal/chat/channels',
  '/api/portal/chat/gifs',
  '/api/portal/chat/media',
  '/api/portal/chat/messages',
  '/api/portal/chat/messages/pin',
  '/api/portal/chat/reactions',
];

// Listed prefixes that must NOT match, even though a listed prefix covers them.
// `/api/portal/chat/channels` legitimately covers `/…/channels/{id}/members`,
// so the administrative sub-routes are subtracted explicitly.
const DENIED_API_PATHS: readonly string[] = [
  '/api/portal/chat/channels/manage',
  '/api/portal/chat/channels/sync',
];

// Denied when the path matches this shape: /api/portal/chat/channels/<id>/members/manage
const DENIED_API_PATTERNS: readonly RegExp[] = [
  /^\/api\/portal\/chat\/channels\/[^/]+\/members\/manage$/,
];

function normalize(pathname: string): string {
  const [withoutQuery] = pathname.split('?');
  return withoutQuery.length > 1 && withoutQuery.endsWith('/')
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

// Segment-aware prefix match. `/portal/training` must cover
// `/portal/training/abc` but never `/portal/trainingfoo`.
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isOnboardingAllowedPage(pathname: string): boolean {
  const path = normalize(pathname);
  return ONBOARDING_ALLOWED_PAGES.some((prefix) => matchesPrefix(path, prefix));
}

export function isOnboardingAllowedApi(pathname: string): boolean {
  const path = normalize(pathname);
  if (DENIED_API_PATHS.some((denied) => matchesPrefix(path, denied))) return false;
  if (DENIED_API_PATTERNS.some((pattern) => pattern.test(path))) return false;
  return ONBOARDING_ALLOWED_APIS.some((prefix) => matchesPrefix(path, prefix));
}

// The one definition of "still onboarding", shared by client guard and server
// gate so the two can never disagree about who it applies to.
export function isOnboardingUser(
  user: { status?: string | null; fieldRole?: FieldRole | null } | null | undefined
): boolean {
  if (!user) return false;
  if (user.status !== 'pending') return false;
  return roleRequiresOnboarding(user.fieldRole ?? undefined);
}
```

- [ ] **Step 4: Add the agreement test**

This is the load-bearing test — the one that stops the two lists drifting apart and silently developing holes. Append to `src/lib/auth/onboardingAccess.test.ts`:

```ts
// Which APIs each allowed page depends on. Maintained here deliberately: the
// assertion below is only as good as this map, so it must be readable and
// reviewable in one place. When you add a page to ONBOARDING_ALLOWED_PAGES,
// add its API dependencies here — this test will fail until you do.
const PAGE_API_DEPENDENCIES: Record<string, string[]> = {
  '/portal/onboarding': ['/api/portal/onboarding', '/api/portal/onboarding/submit', '/api/portal/onboarding/upload'],
  '/portal/chat': ['/api/portal/chat/channels', '/api/portal/chat/messages', '/api/portal/chat/reactions', '/api/portal/chat/media'],
  '/portal/training': ['/api/portal/training', '/api/portal/training/progress'],
  '/portal/resources': ['/api/portal/commission'],
  '/portal/calls': ['/api/portal/calls'],
  '/portal/settings': ['/api/portal/profile'],
};

describe('page and api allowlists agree', () => {
  it('covers every allowed page in the dependency map', () => {
    for (const page of ONBOARDING_ALLOWED_PAGES) {
      expect(Object.keys(PAGE_API_DEPENDENCIES)).toContain(page);
    }
  });

  it('allows every api that an allowed page depends on', () => {
    for (const [page, apis] of Object.entries(PAGE_API_DEPENDENCIES)) {
      for (const api of apis) {
        expect(
          isOnboardingAllowedApi(api),
          `${page} depends on ${api}, which is not allowlisted`
        ).toBe(true);
      }
    }
  });

  it('allows no api whose only consumer would be a blocked page', () => {
    // Shell-wide APIs are reachable from every page and so have no single
    // consumer; everything else must be justified by the map above.
    const SHELL_WIDE = ['/api/portal/notifications', '/api/portal/presence', '/api/portal/push/register'];
    const depended = new Set(Object.values(PAGE_API_DEPENDENCIES).flat());
    for (const api of ONBOARDING_ALLOWED_APIS) {
      if (SHELL_WIDE.includes(api)) continue;
      const justified = [...depended].some(
        (dep) => dep === api || dep.startsWith(`${api}/`)
      );
      expect(justified, `${api} is allowlisted but no allowed page uses it`).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/auth/onboardingAccess.test.ts`
Expected: PASS, all tests. If the third assertion fails, either the API does not belong on the list or a page dependency is missing from the map — decide which, do not weaken the assertion.

- [ ] **Step 6: Gates**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx eslint src/lib/auth/onboardingAccess.ts src/lib/auth/onboardingAccess.test.ts` — expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/onboardingAccess.ts src/lib/auth/onboardingAccess.test.ts
git commit -m "feat(onboarding): single source of truth for onboarding-stage access"
```

---

### Task 2: Widen the onboarding predicate to every invitable role

**Files:**
- Modify: `src/types/auth.ts` (around line 159, `roleRequiresOnboarding`)
- Modify: `src/app/portal/admin/recruiting/page.tsx` (the local `ROLE_OPTIONS` constant, around lines 75-85)
- Test: `src/types/auth.test.ts` (create if absent; otherwise extend)

**Interfaces:**
- Produces: `INVITABLE_FIELD_ROLES: readonly FieldRole[]` and a widened `roleRequiresOnboarding(fieldRole?: FieldRole): boolean`, plus `graduatedFieldRole(fieldRole: FieldRole): FieldRole`. Tasks 5, 6 and 7 consume `graduatedFieldRole`; Task 1's `isOnboardingUser` already consumes `roleRequiresOnboarding`.

**Context:** This is the highest-leverage change in the plan. Five systems ask `roleRequiresOnboarding` first and quit early when it says no: the checklist builder (`src/types/onboarding.ts:123`), the stall/nudge cron (`src/lib/onboarding/stallDetection.ts:50`), activation readiness and auto-activation (`src/lib/onboarding/activation.ts:47,62`), and the manual activate endpoint (`src/app/api/portal/onboarding/activate/route.ts:54`). Widening the predicate brings all five alive through already-tested code paths. `BASE_VETTING_ROLES` in `src/types/onboarding.ts` already contains all eight roles, so the checklist builder produces a correct packet for each — **do not modify `ONBOARDING_ITEMS`.**

- [ ] **Step 1: Write the failing test**

Add to `src/types/auth.test.ts` (create the file with these imports if it does not exist):

```ts
import { describe, expect, it } from 'vitest';
import {
  INVITABLE_FIELD_ROLES,
  graduatedFieldRole,
  roleRequiresOnboarding,
} from './auth';

describe('roleRequiresOnboarding', () => {
  it('is true for every invitable field role', () => {
    expect(INVITABLE_FIELD_ROLES).toHaveLength(8);
    for (const role of INVITABLE_FIELD_ROLES) {
      expect(roleRequiresOnboarding(role)).toBe(true);
    }
  });

  it('names exactly the eight roles the recruiting form offers', () => {
    expect([...INVITABLE_FIELD_ROLES].sort()).toEqual(
      [
        'entry_level_rep',
        'entry_rep',
        'ibo_level_1',
        'ibo_level_2',
        'ibo_level_3',
        'ibo_level_4',
        'l1_manager',
        'l2_manager',
      ].sort()
    );
  });

  it('is false for roles that are not invite targets', () => {
    expect(roleRequiresOnboarding('general_manager')).toBe(false);
    expect(roleRequiresOnboarding('gm_in_training')).toBe(false);
    expect(roleRequiresOnboarding('office_manager')).toBe(false);
  });

  it('is false when no field role is present', () => {
    expect(roleRequiresOnboarding(undefined)).toBe(false);
  });
});

describe('graduatedFieldRole', () => {
  it('promotes an entry level rep to Account Executive', () => {
    expect(graduatedFieldRole('entry_level_rep')).toBe('entry_rep');
  });

  it('leaves every other role unchanged', () => {
    for (const role of INVITABLE_FIELD_ROLES) {
      if (role === 'entry_level_rep') continue;
      expect(graduatedFieldRole(role)).toBe(role);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/types/auth.test.ts`
Expected: FAIL — `INVITABLE_FIELD_ROLES` and `graduatedFieldRole` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/types/auth.ts`, replace the existing `roleRequiresOnboarding` with:

```ts
// The field roles the recruiting invite form offers. Every one of them goes
// through the onboarding checklist and activates into the role it was invited
// as. Sourced here rather than in the recruiting page so the invite form and
// the onboarding predicate can never disagree — an earlier version offered
// eight roles while only one of them actually onboarded, which stranded the
// other seven at status 'pending' with an empty checklist and no way out.
export const INVITABLE_FIELD_ROLES: readonly FieldRole[] = [
  'entry_level_rep',
  'entry_rep',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
];

export function roleRequiresOnboarding(fieldRole?: FieldRole): boolean {
  if (!fieldRole) return false;
  return INVITABLE_FIELD_ROLES.includes(fieldRole);
}

// What a hire becomes when their last checklist item is approved. Entry Level
// Rep graduates to Account Executive; every other role activates as invited.
export function graduatedFieldRole(fieldRole: FieldRole): FieldRole {
  return fieldRole === 'entry_level_rep' ? 'entry_rep' : fieldRole;
}
```

Then in `src/app/portal/admin/recruiting/page.tsx`, delete the local `ROLE_OPTIONS` array and import the shared list instead:

```ts
import { INVITABLE_FIELD_ROLES } from '@/types/auth';
```

Replace every use of `ROLE_OPTIONS` in that file with `INVITABLE_FIELD_ROLES`. Keep the existing comment's intent — that the form offers a fixed subset excluding `general_manager`/`gm_in_training`/`office_manager` — by moving it to the `INVITABLE_FIELD_ROLES` declaration.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/types/auth.test.ts`
Expected: PASS.

Run: `npm test`
Expected: several existing tests in `src/lib/onboarding/activation.test.ts` and `src/lib/onboarding/stallDetection.test.ts` now FAIL, because they encode the old single-role rule. **This is correct.** Read each failure. Update the assertions to the new rule — do not weaken a test to make it pass, and do not delete a case. Where a test asserted "a non-onboarding role short-circuits", change its fixture role to `general_manager` (still genuinely non-onboarding) rather than deleting the case.

Re-run `npm test` until green.

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit` — expected: no errors. If a `Record<FieldRole, …>` map anywhere is now non-exhaustive, TypeScript will name it; fix each.
Run: `npx eslint` on the changed files — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(onboarding): every invitable field role goes through onboarding"
```

---

### Task 3: Server-side gate reads the allowlist

**Files:**
- Modify: `src/lib/auth/requireVerifiedAdmin.ts`
- Modify: `src/lib/auth/requireVerifiedAdmin.test.ts`
- Modify: all 15 route files currently passing `allowOnboarding` (find them with `grep -rl "allowOnboarding" src/app/api/`)

**Interfaces:**
- Consumes: `isOnboardingAllowedApi` from Task 1.
- Produces: all six exported helpers (`requireVerifiedUser`, `requireVerifiedManagement`, `requireVerifiedSelfOrManagement`, `requireVerifiedFieldManagerOrManagement`, `requireVerifiedAdmin`, `requireVerifiedRequester`) lose their `VerifiedCallerOptions` parameter entirely.

**Context:** Today each route hand-declares `allowOnboarding: true`. That is the drift risk: a future route can be reachable on the client while closed on the server, or the reverse, and nothing complains. After this task the decision comes from the path, looked up in one table.

- [ ] **Step 1: Rewrite the status gate**

In `src/lib/auth/requireVerifiedAdmin.ts`:

- Delete the exported `VerifiedCallerOptions` type and every `allowOnboarding` parameter from `verifyCaller` and all six exported helpers.
- `verifyCaller(request)` computes the relaxation itself:

```ts
const status = checkStatus(data, isOnboardingAllowedApi(request.nextUrl.pathname));
```

- Keep `checkStatus`'s signature and body exactly as they are (second parameter renamed to `allowOnboarding` still reads correctly). Its semantics are load-bearing and unchanged: `active` passes; `pending` passes only when the relaxation applies AND a field role is present; everything else, including `inactive`, is refused.
- Replace the `VerifiedCallerOptions` doc comment with one explaining that the relaxation now comes from `onboardingAccess.ts` and pointing there.

- [ ] **Step 2: Update all call sites**

Run `grep -rn "allowOnboarding" src/app/api/` and remove the option from every call. The 15 files are: `calls`, `commission`, `leaderboard`, `notifications` (four call sites), `onboarding`, `onboarding/submit`, `onboarding/upload`, `presence`, `profile`, `push/register`, `sales`, `sales/stats`, `training`, `training/[id]`, `training/progress`.

Removing it from `leaderboard`, `sales` and `sales/stats` is what closes them — those three paths are not in the allowlist, so a pending hire now gets 403. That is intended.

In `src/app/api/portal/leaderboard/route.ts` the comment above the gate (lines ~18-23) explains that a pending rep lands on the dashboard and needs the leaderboard. That is no longer true — a pending hire lands on `/portal/onboarding` and cannot open either page. Rewrite that comment to say so. Leave the `NON_MANAGEMENT_LIMIT_CAP` logic untouched.

Do not touch the `requireVerifiedManagement` call in `notifications/route.ts` (~line 126).

**Also update four stale comments.** `src/lib/auth/onboardingAccess.test.ts` has an `ALLOWED_SUBPATHS` array whose entries carry a justification comment naming each route's own auth gate. Four of them cite `{ allowOnboarding: true }`, which this task deletes — leaving them both factually wrong and circular ("allowed because the route opts into onboarding", when the route's opt-in now *is* this allowlist). The affected entries are `onboarding/submit`, `onboarding/upload`, `training/[id]` and `training/progress`. Rewrite each to cite the surviving, non-circular justification: the self-or-management / requester identity check that scopes the route to the caller's own record. The `onboarding/review` and `onboarding/activate` comments stay as they are — `requireVerifiedManagement` re-checks role independently of status, so relaxing status never opens them to a hire.

- [ ] **Step 3: Update the helper's tests**

`src/lib/auth/requireVerifiedAdmin.test.ts` has 41 tests, several of which pass `{ allowOnboarding: true }`. Those now drive the behaviour through the request pathname instead. For each such test, build the mock `NextRequest` with a `nextUrl.pathname` that is on the allowlist (e.g. `/api/portal/training`) to exercise the admitted case, and one that is not (e.g. `/api/portal/sales`) to exercise the refused case.

Add these cases if not already covered:

```ts
it('admits a pending hire on an allowlisted path', async () => {
  // status 'pending' + fieldRole 'entry_level_rep', pathname '/api/portal/training'
  // expect ok: true
});

it('refuses the same pending hire on a path that is not allowlisted', async () => {
  // same user, pathname '/api/portal/sales'
  // expect ok: false, status 403
});

it('refuses a pending self-signup with no field role even on an allowlisted path', async () => {
  // status 'pending', no fieldRole, pathname '/api/portal/training'
  // expect ok: false, status 403
});

it('refuses a deactivated account on an allowlisted path', async () => {
  // status 'inactive', fieldRole 'entry_rep', pathname '/api/portal/training'
  // expect ok: false, status 403
});
```

Preserve the existing assertion that a management *field* role is `isManagerOrAbove` but NOT `isManagement` — it protects `src/app/api/portal/sales/route.ts:61`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/auth/`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit` — expected: no errors, and any route still passing the removed option is named here.
Run: `npx eslint` on changed files — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(auth): derive onboarding-stage access from the shared allowlist"
```

---

### Task 4: The client guard and navigation

**Files:**
- Create: `src/components/portal/OnboardingGate.tsx`
- Modify: `src/app/portal/layout.tsx`
- Modify: `src/components/portal/PortalSidebar.tsx`
- Modify: `src/components/portal/MobileBottomNav.tsx`
- Modify: `src/components/portal/CommandPalette.tsx` (line ~87 gates "My Onboarding" on `roles: ['entry_level_rep']`)
- Test: `src/components/portal/OnboardingGate.test.tsx`

**Interfaces:**
- Consumes: `isOnboardingUser`, `isOnboardingAllowedPage` from Task 1; `useAuth()` from `src/contexts/AuthContext.tsx`, whose user carries `status` and `fieldRole`.

**Context:** `src/app/portal/layout.tsx` is a server component and must stay one — it declares `metadata` and loads the Archivo font. The gate is a separate client component mounted inside `AuthProvider`, wrapping `children`.

- [ ] **Step 1: Write the failing test**

Create `src/components/portal/OnboardingGate.test.tsx`. Mock `useAuth` and `next/navigation`'s `useRouter`/`usePathname`. Cover:

```
- pending hire on /portal/dashboard  → router.replace called with '/portal/onboarding'
- pending hire on /portal/chat       → no redirect, children rendered
- pending hire on /portal/onboarding → no redirect, children rendered
- active rep on /portal/dashboard    → no redirect, children rendered
- admin on /portal/admin/users       → no redirect, children rendered
- loading === true                   → no redirect, children rendered (no flash)
- signed-out (user null)             → no redirect, children rendered
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/portal/OnboardingGate.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the gate**

Create `src/components/portal/OnboardingGate.tsx`:

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingAllowedPage, isOnboardingUser } from '@/lib/auth/onboardingAccess';

// Confines a hire who has not finished onboarding to their checklist plus the
// welcome set the client chose (chat, training, resources, calls, settings).
// The server enforces the same list independently via onboardingAccess.ts — this
// exists so a hire sees their checklist instead of a redirect loop, not as the
// security boundary.
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const blocked = !loading && isOnboardingUser(user) && !isOnboardingAllowedPage(pathname);

  useEffect(() => {
    if (blocked) router.replace('/portal/onboarding');
  }, [blocked, router]);

  // Render nothing on the frame we are redirecting away from, so a blocked page
  // never paints. While auth is still loading, render normally — a premature
  // redirect would bounce an admin on a hard refresh.
  if (blocked) return null;

  return <>{children}</>;
}
```

- [ ] **Step 4: Mount it**

In `src/app/portal/layout.tsx`, wrap `children` inside the existing `portal-scope` div:

```tsx
<div className={`portal-scope contents ${archivo.variable}`}>
  <OnboardingGate>{children}</OnboardingGate>
</div>
```

Add the import. Do not add `'use client'` to `layout.tsx`.

- [ ] **Step 5: Filter the navigation**

In `PortalSidebar.tsx`, `MobileBottomNav.tsx` and `CommandPalette.tsx`, when `isOnboardingUser(user)` is true, filter each item list so only items whose `href` satisfies `isOnboardingAllowedPage` remain. Apply it to every list the component renders, including grouped sections and quick actions — a hire must not see a link that would bounce them.

In `CommandPalette.tsx` line ~87, the "My Onboarding" entry is gated on `roles: ['entry_level_rep']`. Replace that with a check that the user's field role requires onboarding, so all eight roles see their own checklist link.

- [ ] **Step 6: Hide the chat ticker for an unfinished hire**

`/portal/chat` is an allowed page, but it calls `GET /api/portal/sales/company-stats`, which is NOT allowlisted and will return 403 for a hire mid-onboarding.

That is deliberate, not an oversight: the client excluded Dashboard and Leaderboard specifically so company sales figures are not visible to someone whose background check has not cleared, and the ticker shows the same class of data. Allowlisting it would contradict that decision.

So the ticker must be **hidden**, not left to fail. When `isOnboardingUser(user)` is true, do not render the ticker and do not issue the request. A 403 in the console on an allowed page is a bug report waiting to happen.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/portal/` then `npm test`
Expected: PASS.

- [ ] **Step 7: Browser check**

Start the dev server (`PORT=3005 npm run dev` — ports 3000 and 3001 belong to another project and must not be disturbed). Confirm the portal still renders for a signed-in user and the console is clean. A pending-hire account cannot be created locally, so the redirect path itself is covered by the unit tests, not the browser. Report exactly that; do not claim the redirect was seen working.

- [ ] **Step 8: Gates and commit**

Run: `npx tsc --noEmit`, `npx eslint` on changed files.

```bash
git add -A
git commit -m "feat(portal): confine unfinished hires to onboarding plus the welcome set"
```

---

### Task 5: Firestore rules admit a hire to chat

**Files:**
- Modify: `firestore.rules`

**Context:** `isApproved()` requires `status == 'active'`, which is why a pending hire cannot use chat today. **This file is committed but NOT deployed** — deploying is the client's decision later.

- [ ] **Step 1: Add the companion function**

In `firestore.rules`, beside `isApproved()` (around line 14), add:

```
    // A hire who has been invited and holds a field role, but has not finished
    // onboarding. Deliberately narrower than isApproved(): an unapproved
    // self-signup has no fieldRole and a decommissioned account is 'inactive',
    // so neither matches. Used ONLY for chat — the client chose to let a new
    // hire talk to their team from day one.
    function isOnboardingMember() {
      return request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'pending' &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.fieldRole != null;
    }
```

- [ ] **Step 2: Widen only the chat conditions**

Find every chat-related `match` block (channels, messages, reactions, membership/read-state) and change its `isApproved()` to `(isApproved() || isOnboardingMember())`.

Leave every other `isApproved()` exactly as it is — in particular `userProgress`, `sales` and `leaderboard` must NOT gain this. Verify by diffing: the only changed conditions should be chat's.

- [ ] **Step 3: Verify the rules parse**

Run: `npx -y firebase-tools firestore:rules:validate firestore.rules --project cworldgroup-cca68` if that subcommand exists in the installed version; otherwise confirm syntax by inspection and state in the report that automated validation was unavailable. **Do not run `firebase deploy`.**

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): let an unfinished hire use team chat (NOT DEPLOYED)"
```

---

### Task 6: Graduate into the invited role

**Files:**
- Modify: `src/lib/onboarding/activation.ts` (the `fieldRole: 'entry_rep'` write, around line 66)
- Modify: `src/app/api/portal/onboarding/activate/route.ts` (lines 53-55)
- Modify: `src/lib/onboarding/activation.test.ts`

**Interfaces:**
- Consumes: `graduatedFieldRole` from Task 2.

**Context:** Both files hardcode the graduated role to `entry_rep`. The manual activate route already checks readiness correctly (`getActivationReadiness`, returning 409 with a `missing` array) — do not add a second readiness check.

- [ ] **Step 1: Write the failing test**

In `src/lib/onboarding/activation.test.ts`, add a case per role: a user with all items approved activates with `status: 'active'` and `fieldRole` equal to `graduatedFieldRole(invitedRole)`. Assert explicitly that an invited `l1_manager` activates as `l1_manager` and an `entry_level_rep` activates as `entry_rep`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/onboarding/activation.test.ts`
Expected: FAIL — the L1 manager case activates as `entry_rep`.

- [ ] **Step 3: Implement**

In `src/lib/onboarding/activation.ts`, replace the hardcoded write with `fieldRole: graduatedFieldRole(fieldRole)`.

In `src/app/api/portal/onboarding/activate/route.ts`, replace:

```ts
...(roleRequiresOnboarding(userSnap.get('fieldRole'))
  ? { fieldRole: 'entry_rep' }
  : {}),
```

with a `graduatedFieldRole` call on the doc's current field role, guarded so a user with no field role is left unchanged.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/onboarding/` then `npm test`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
git add -A
git commit -m "feat(onboarding): activate a hire into the role they were invited as"
```

---

### Task 7: Close the second door

**Files:**
- Modify: `src/app/api/portal/auth/users/[id]/route.ts` (`shouldKickoffChecklist` line 197 / consumed line 272; `shouldActivateImmediately` lines 198-205)
- Modify: `src/app/portal/admin/users/page.tsx` (Accept confirm dialog copy, around line 344)
- Modify: `src/app/portal/admin/recruiting/page.tsx` (the cosmetic Activate control)

**Context:** Two doors lead into a hire. The recruiting invite is one; assigning a field role to a pending self-signup in User Management is the other. The second currently activates the account immediately with no paperwork. The client chose on 2026-07-25 to close it. This reverses a decision from the superseded 2026-07-09 spec — that is deliberate and recorded in the design doc.

The **Accept** button on the users page is KEPT. It is an explicit, confirm-guarded, human-decided override, which is a different thing from a silent bypass.

- [ ] **Step 1: Widen the checklist kickoff**

`shouldKickoffChecklist` (line 197) currently fires only when the assigned role is `entry_level_rep`. Widen it to any role for which `roleRequiresOnboarding` is true, preserving the existing "not already that role" guard so re-saving a user does not re-kick their checklist.

- [ ] **Step 2: Keep the immediate-activation branch, narrowed to non-invitable roles**

**Do NOT delete `shouldActivateImmediately` (lines 198-205).** An earlier draft of this plan said to; that was wrong and would have re-created the exact trap this project exists to fix.

Its `!roleRequiresOnboarding(fieldRole)` term is now false for all eight invitable roles, so the branch stops firing for field hires — which is the change the client asked for. But it is still true for the three non-invitable roles (`general_manager`, `gm_in_training`, `office_manager`), which are internal/office positions, are not recruiting invite targets, and have no checklist. If the branch were deleted, assigning one of those roles to a pending user would strand them at `status: 'pending'` forever with an empty checklist and no path to activation — the same permanent limbo the seven broken invite roles are in today.

So: leave the constant and its branch in place, and add a comment stating that it now covers exactly the three non-invitable roles and why. Verify with a test that assigning `general_manager` to a pending user still activates them immediately, and that assigning `l1_manager` does not.

Related, and the reason this matters beyond this file: `checkStatus` in `src/lib/auth/requireVerifiedAdmin.ts` admits `pending` plus **any truthy** field role, while `isOnboardingUser` admits `pending` plus a role that **requires onboarding**. Those two sets differ by exactly these three roles. Task 3 must not narrow the server gate in a way that locks out a pending internal hire — if Task 3 already shipped, re-read its diff against this note before marking Task 7 complete.

- [ ] **Step 3: Update the Accept dialog copy**

`src/app/portal/admin/users/page.tsx` around line 344: the confirm dialog says the action skips remaining onboarding. Now that every invited role has a real packet, the copy must say which role the person will activate as, and that the outstanding checklist items will be skipped. Keep it to two sentences. Do not change the button's behaviour or its guard condition.

- [ ] **Step 4: Wire the recruiting Activate control**

In `src/app/portal/admin/recruiting/page.tsx`, make the Activate control call `POST /api/portal/onboarding/activate` with `{ userId }` and an `Authorization: Bearer` header obtained from `getIdToken()` (`src/lib/firebase/getIdToken.ts` — the race-safe helper; do NOT use `auth.currentUser.getIdToken()`). On a 409, surface the returned `missing` item labels in the UI rather than a generic failure. On success, refresh the list.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS. Existing tests covering the users PUT route will need updating where they assert immediate activation — update the assertion to the new behaviour, do not delete the case.

- [ ] **Step 6: Gates and commit**

```bash
git add -A
git commit -m "feat(onboarding): assigning a field role enrols in onboarding instead of activating"
```

---

### Task 8: Signature integrity

**Files:**
- Modify: `src/lib/esign/autoSend.ts`
- Modify: `src/app/api/portal/onboarding/submit/route.ts`
- Modify: `src/app/api/portal/onboarding/route.ts` (retry-on-load)
- Modify: `src/app/portal/onboarding/page.tsx` and/or `src/components/onboarding/OnboardingWizard.tsx` (locked item state)
- Test: `src/lib/esign/autoSend.test.ts` (create if absent)

**Context:** Four documents go out for signature (`fcra_auth`, `contract`, `direct_deposit`, `pay_structure`). Three defects compound: a per-item failure is caught and only `console.error`'d, leaving the item `not_started` so the checklist renders the generic free-text reference input; `getEsignProvider()` is called *outside* the per-item try/catch so a bad `ESIGN_PROVIDER` kills all four at once; and both call sites use `void sendPendingEsignDocs(...).catch(...)` so nothing downstream ever learns.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/esign/autoSend.test.ts` with a mocked provider and mocked `adminDb`. Cover:

```
- createEnvelope throws for one item → that item's doc gains
  esignDispatch { state: 'failed', attempts: 1, lastError, lastAttemptAt };
  the other items still send
- a second failure increments attempts to 2
- getEsignProvider throws → every applicable e-sign item is marked failed,
  and the function does not throw
- an item whose lastAttemptAt is under 5 minutes old is skipped on retry
- an item whose lastAttemptAt is older than 5 minutes is retried
- attempts reaching 3 raises exactly one alert task for the user
- a successful envelope clears esignDispatch and resolves the alert task
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/esign/autoSend.test.ts`
Expected: FAIL.

- [ ] **Step 3: Record failures and move the provider inside the guard**

In `src/lib/esign/autoSend.ts`:

- Wrap `getEsignProvider()` so a provider-level throw marks every applicable e-sign item failed rather than throwing before the loop.
- On a caught `createEnvelope` error, merge onto `userOnboarding/{userId}_{itemId}`:

```ts
esignDispatch: {
  state: 'failed',
  attempts: previousAttempts + 1,
  lastError: String(error).slice(0, 500),
  lastAttemptAt: now,
}
```

- On success, clear `esignDispatch` (`FieldValue.delete()`).
- Add a `minRetryIntervalMs` of 5 minutes: skip an item whose `esignDispatch.lastAttemptAt` is newer than that.
- At `attempts >= 3`, raise ONE alert task per user (not per item) through `src/lib/alerts/alertTasks.ts`, matching how stalled candidates already appear in the ops Action Queue. Resolve it when an envelope succeeds. Follow the existing alert-task shape in that module — read it, do not invent a new type without checking.

- [ ] **Step 4: Retry when the hire opens their checklist**

In `src/app/api/portal/onboarding/route.ts` (GET), trigger a retry for failed items. It must be non-blocking — the checklist response must not wait on the provider. The 5-minute throttle from Step 3 makes repeated page loads safe.

- [ ] **Step 5: Refuse typed references server-side**

In `src/app/api/portal/onboarding/submit/route.ts`, reject any client-supplied reference for an item where `isEsignItem(itemId)` is true (import from `src/lib/onboarding/esign.ts`), returning 400 with a clear message. Those items are completed only by the provider webhook.

This is the hard guarantee: even if the UI regresses, a contract cannot be marked signed by typing into a box. Add a test for it.

- [ ] **Step 6: Lock the item in the UI**

In the checklist UI, an item whose `esignDispatch.state === 'failed'` renders as a locked card reading exactly:

> Preparing your document — check back shortly.

No text input, no submit affordance. Items in the normal sent state keep the existing `ESIGN_HELPER_TEXT` from `src/lib/onboarding/esign.ts`.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Gates and commit**

```bash
git add -A
git commit -m "feat(esign): record, lock, retry and escalate failed signature envelopes"
```

---

### Task 9: Leftovers and final gates

**Files:**
- Modify: `src/types/onboarding.ts` (lines 53-55, `signatureProvider: 'adobe_sign'`)
- Modify: `src/lib/esign/signwell.ts` (line 127, `test_mode`)
- Modify: `src/app/api/portal/onboarding/upload/route.ts`

- [ ] **Step 1: Remove dead metadata**

`signatureProvider: 'adobe_sign'` appears on `contract`, `direct_deposit` and `pay_structure` and has **zero consumers anywhere in the codebase** — verify with `grep -rn "signatureProvider" src/` before removing. Delete the three values.

Keep the optional `signatureProvider` field on the `OnboardingItem` type, and keep the `adobe_sign` branch in `src/lib/esign/provider.ts:32-35` that throws "not implemented" — that is where a real Adobe integration plugs in if the client obtains API access. Do not implement Adobe Sign.

- [ ] **Step 2: Guard test mode in production**

`src/lib/esign/signwell.ts:127` passes `test_mode: process.env.SIGNWELL_TEST_MODE === 'true'` with no environment check. Documents signed in test mode are not legally binding. Throw at envelope creation when test mode is requested and the environment is production (`process.env.VERCEL_ENV === 'production'`, or `process.env.NODE_ENV === 'production'` outside Vercel), with a message naming `SIGNWELL_TEST_MODE`.

Add tests: throws in production, passes in development, passes in production when the flag is absent or false.

- [ ] **Step 3: Gate the upload route before parsing**

`src/app/api/portal/onboarding/upload/route.ts` parses the multipart body before its auth gate, because the target userId lives in the form data. Take the identity from the verified token and gate first, then parse. A stranger must not be able to make the server buffer a large upload. Confirm the route still works for its legitimate caller — the two-sided driver's-licence upload passes a `getHeaders` prop through `src/components/onboarding/FileUpload.tsx`.

- [ ] **Step 4: Full gates**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npm test` — expected: all pass. Report the count.
Run: `npm run build` — expected: success.
Run: `npx eslint` on every file changed across all nine tasks — expected: clean on those files. The repo's 26 pre-existing errors elsewhere are out of scope and must not be reported as fixed or as absent.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(onboarding): drop dead adobe_sign metadata, guard test mode, gate uploads first"
```

---

## Verification honesty

These cannot be verified in this environment. Any report claiming otherwise is wrong:

- **No SignWell API key.** The signature failure/retry/escalation logic is unit-tested only. "A real envelope arrives in an inbox" is UNVERIFIED.
- **Firestore rules are not deployed.** Chat access for a pending hire cannot be confirmed against production.
- **No pending-hire account exists locally.** The redirect behaviour is covered by unit tests, not by a browser session.
- Browser checks run against the local dev server on port 3005 only. Ports 3000 and 3001 belong to a different project — do not touch them.
