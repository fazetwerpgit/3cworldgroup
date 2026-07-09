# Onboarding Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The portal takes over the entire rep-onboarding funnel: automation advances every step it can (e-sign, notifications, nudges); humans are aggressively notified for the two steps that need them (upload review, final activation).

**Architecture:** Extend the existing invite/checklist/review pipeline in the 3cworldgroup portal. Add a provider-agnostic e-sign layer (SignWell first, Adobe Sign swappable), a Postmark email service, an FCM push activation, a broadcast+claim alert engine on a new `alertTasks` collection, and a Vercel Cron stall detector. All Firestore writes stay behind Admin-SDK API routes (client rules are locked to `false` for every onboarding collection).

**Tech Stack:** Next.js 16.1.1 App Router, React 19, TypeScript, Firebase Admin SDK (Auth/Firestore/Storage), FCM, Tailwind v4 + shadcn-style `src/components/ui/*`, Vitest (colocated `*.test.ts`), Postmark HTTP API, SignWell HTTP API, Vercel Cron.

**Design source:** `docs/onboarding-automation-design.md` (agreed 2026-07-08). Note: decision 7 named Resend as default; the open-items section supersedes it — **Postmark** is decided.

## Global Constraints

- Repo root: `C:\Users\jacob\dev\3cworldgroup`. All paths below are relative to it. Do NOT work in `C:\Users\jacob\dev\onboarding`.
- Path alias `@/*` → `./src/*`. Tests colocated as `src/**/*.test.ts`, Vitest node environment, style: `import { describe, it, expect } from 'vitest'`.
- Quality gates after every task: `npx tsc --noEmit` (no `typecheck` script exists), `npm test`. `npm run build` at final verification and after any route/page task.
- Every new Firestore collection must be added to `firestore.rules` with `allow read, write: if false;` (Admin SDK only). Rules deploys are a manual step — flag them, don't run them.
- Auth patterns: match the existing `requireManagement`/`requireSelfOrManagement` (client-supplied uid) pattern for parity with sibling routes; use `requireVerified*` (bearer token) for anything sensitive-adjacent. Webhook and cron routes use their own secrets (provider signature / `CRON_SECRET`).
- Email must NEVER break a flow: `sendEmail` returns `{ok:false}` and logs instead of throwing; callers fire-and-forget with `.catch`.
- Postmark free dev tier (100 emails/mo, may be restricted to own-domain recipients until production approval) — fine for build/testing; upgrade before real rep volume.
- E-sign: first provider is **SignWell** behind the `EsignProvider` interface. Adobe Sign swaps in later ONLY if the account tier includes API access (unconfirmed as of 2026-07-08). No code outside `src/lib/esign/` may reference a concrete provider.
- New env vars introduced by this plan (add to `.env.local` and Vercel): `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `APP_BASE_URL`, `ESIGN_PROVIDER` (default `signwell`), `SIGNWELL_API_KEY`, `SIGNWELL_TEST_MODE`, `CRON_SECRET`.
- Commit after every task (new commits, never amend). No emojis anywhere.
- `Date`/`Timestamp` convention: Admin SDK writes use `new Date()` (matches existing routes, e.g. the invite-submit batch).

---

### Task 1: Three new field roles

**Files:**
- Modify: `src/types/auth.ts`
- Modify: `src/components/portal/PortalSidebar.tsx`
- Modify: `src/lib/auth/requireManagement.ts`
- Modify: `firestore.rules`
- Test: `src/types/auth.test.ts` (create)

**Interfaces:**
- Consumes: existing `FieldRole`, `RolePermissions`, `RoleDisplayNames`, `resolveRoles` in `src/types/auth.ts`.
- Produces: `FieldRole` union extended with `'general_manager' | 'gm_in_training' | 'office_manager'`; new exports `LIGHT_VETTING_ROLES: readonly FieldRole[]` and `MANAGEMENT_FIELD_ROLES: readonly FieldRole[]`. Later tasks import both.

- [ ] **Step 1: Write the failing test**

Create `src/types/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveRoles,
  RoleDisplayNames,
  LIGHT_VETTING_ROLES,
  MANAGEMENT_FIELD_ROLES,
} from './auth';

describe('new field roles', () => {
  it('resolves the three new roles as field roles', () => {
    for (const r of ['general_manager', 'gm_in_training', 'office_manager']) {
      const { role, fieldRole } = resolveRoles(undefined, r);
      expect(role).toBeUndefined();
      expect(fieldRole).toBe(r);
    }
  });

  it('has display names for the new roles', () => {
    expect(RoleDisplayNames.general_manager).toBe('General Manager');
    expect(RoleDisplayNames.gm_in_training).toBe('GM in Training');
    expect(RoleDisplayNames.office_manager).toBe('Office Manager');
  });

  it('classifies management and light-vetting membership', () => {
    expect(MANAGEMENT_FIELD_ROLES).toContain('general_manager');
    expect(MANAGEMENT_FIELD_ROLES).toContain('office_manager');
    expect(MANAGEMENT_FIELD_ROLES).not.toContain('gm_in_training');
    expect(LIGHT_VETTING_ROLES).toEqual(['general_manager', 'gm_in_training', 'office_manager']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/types/auth.test.ts`
Expected: FAIL — `LIGHT_VETTING_ROLES` is not exported / TS errors on missing union members.

- [ ] **Step 3: Extend `src/types/auth.ts`**

```ts
export type FieldRole =
  | 'entry_rep'
  | 'l1_manager'
  | 'l2_manager'
  | 'ibo_level_1'
  | 'ibo_level_2'
  | 'ibo_level_3'
  | 'ibo_level_4'
  | 'general_manager'
  | 'gm_in_training'
  | 'office_manager';

/** Internal-promotion roles: no background screen, SSN, DL#, or DL photos. */
export const LIGHT_VETTING_ROLES: readonly FieldRole[] = [
  'general_manager',
  'gm_in_training',
  'office_manager',
];

/** Field roles treated as management for gating and alert broadcast. */
export const MANAGEMENT_FIELD_ROLES: readonly FieldRole[] = [
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'general_manager',
  'office_manager',
];
```

Add to `RoleDisplayNames`: `general_manager: 'General Manager'`, `gm_in_training: 'GM in Training'`, `office_manager: 'Office Manager'`.

Add to `RolePermissions`: copy the `l1_manager` permission array for `general_manager` and `office_manager`; copy the `entry_rep` array for `gm_in_training`. (Both `Record<PlatformRole | FieldRole, ...>` maps will be compile errors until all three keys exist — the compiler enforces completeness.)

- [ ] **Step 4: Update sidebar gating**

In `src/components/portal/PortalSidebar.tsx`, add `'general_manager', 'gm_in_training', 'office_manager'` to the `roles` array of the Onboarding nav item (`href: '/portal/onboarding'`). Grep the file for other `roles:` arrays listing all seven field roles (i.e., "any field user" intent) and add the three new roles there too; leave admin/ops-only items untouched.

- [ ] **Step 5: Update `requireManagement.ts` to use the shared list**

In `src/lib/auth/requireManagement.ts`, find the hardcoded field-role list inside the management check and replace it with `MANAGEMENT_FIELD_ROLES` imported from `@/types/auth`, e.g.:

```ts
import { MANAGEMENT_FIELD_ROLES } from '@/types/auth';
// inside the management predicate:
const isFieldManager =
  !!user.fieldRole && (MANAGEMENT_FIELD_ROLES as readonly string[]).includes(user.fieldRole);
```

Keep the admin/operations platform-role check exactly as it is. Also check `src/lib/auth/requireVerifiedAdmin.ts` for a duplicated field-role list (`requireVerifiedFieldManagerOrManagement`) and apply the same substitution if present.

- [ ] **Step 6: Update `firestore.rules`**

In the `isManagement()` function, extend the fieldRole list:

```
u.fieldRole in ['l1_manager','l2_manager','ibo_level_1','ibo_level_2','ibo_level_3','ibo_level_4','general_manager','office_manager']
```

Do NOT deploy rules; note in the commit message that a manual `firebase deploy --only firestore:rules` is required.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- src/types/auth.test.ts` → PASS. Then `npx tsc --noEmit` → zero errors (this is what catches any `Record` map missing the new keys).

- [ ] **Step 8: Commit**

```bash
git add src/types/auth.ts src/types/auth.test.ts src/components/portal/PortalSidebar.tsx src/lib/auth/requireManagement.ts src/lib/auth/requireVerifiedAdmin.ts firestore.rules
git commit -m "feat(roles): add general_manager, gm_in_training, office_manager field roles"
```

---

### Task 2: Checklist updates — FCRA item, role-filtered vetting, heavy-vetting helper

**Files:**
- Modify: `src/types/onboarding.ts`
- Modify: `src/app/api/public/onboarding/[token]/route.ts`
- Modify: `src/app/onboard/[token]/page.tsx`
- Test: `src/types/onboarding.test.ts` (create)

**Interfaces:**
- Consumes: `FieldRole` from Task 1; existing `OnboardingItem`, `ONBOARDING_ITEMS`, `getOnboardingItemsForUser(fieldRole, isIBO)`.
- Produces: new exports `BASE_VETTING_ROLES: readonly FieldRole[]` and `requiresHeavyVetting(fieldRole: FieldRole): boolean`; new checklist item id `'fcra_auth'` (esign). Later tasks rely on the four esign item ids being exactly `'contract' | 'direct_deposit' | 'pay_structure' | 'fcra_auth'`.

- [ ] **Step 1: Write the failing test**

Create `src/types/onboarding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_ITEMS,
  getOnboardingItemsForUser,
  requiresHeavyVetting,
} from './onboarding';

describe('checklist role filtering', () => {
  it('includes fcra_auth as a 4th esign item for base roles', () => {
    const esign = ONBOARDING_ITEMS.filter((i) => i.referenceKind === 'esign').map((i) => i.id);
    expect(esign.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure']);
    const entryRep = getOnboardingItemsForUser('entry_rep', false).map((i) => i.id);
    expect(entryRep).toContain('fcra_auth');
    expect(entryRep).toContain('background_check');
    expect(entryRep).toContain('dl_photos');
  });

  it('excludes heavy-vetting items for light-vetting roles', () => {
    for (const role of ['general_manager', 'gm_in_training', 'office_manager'] as const) {
      const ids = getOnboardingItemsForUser(role, false).map((i) => i.id);
      expect(ids).not.toContain('background_check');
      expect(ids).not.toContain('dl_photos');
      expect(ids).not.toContain('fcra_auth');
      expect(ids).toContain('w9');
      expect(ids).toContain('contract');
    }
  });

  it('requiresHeavyVetting is true only for base roles', () => {
    expect(requiresHeavyVetting('entry_rep')).toBe(true);
    expect(requiresHeavyVetting('ibo_level_2')).toBe(true);
    expect(requiresHeavyVetting('general_manager')).toBe(false);
    expect(requiresHeavyVetting('office_manager')).toBe(false);
  });

  it('items are ordered without duplicate order values', () => {
    const orders = ONBOARDING_ITEMS.map((i) => i.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/types/onboarding.test.ts`
Expected: FAIL — `requiresHeavyVetting` not exported, no `fcra_auth` item.

- [ ] **Step 3: Modify `src/types/onboarding.ts`**

```ts
import type { FieldRole } from './auth';

/** The original seven roles that get full vetting (screen, SSN, DL). */
export const BASE_VETTING_ROLES: readonly FieldRole[] = [
  'entry_rep',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
];

/** Light-vetting roles (GM, GM-in-training, Office Manager) skip SSN/DL/screen. */
export function requiresHeavyVetting(fieldRole: FieldRole): boolean {
  return (BASE_VETTING_ROLES as readonly string[]).includes(fieldRole);
}
```

In `ONBOARDING_ITEMS`:
1. Insert after `w9` a new item:

```ts
{
  id: 'fcra_auth',
  label: 'Background Check Authorization (FCRA)',
  category: 'credential',
  appliesToRoles: [...BASE_VETTING_ROLES],
  iboOnly: false,
  sensitive: false,
  referenceKind: 'esign',
  order: 2,
},
```

2. Set `appliesToRoles: [...BASE_VETTING_ROLES]` on `background_check` and `dl_photos` (currently empty arrays).
3. Renumber `order` sequentially: `w9`=1, `fcra_auth`=2, `background_check`=3, `dl_photos`=4, `contract`=5, `direct_deposit`=6, `pay_structure`=7, `onboarding_submission`=8, `llc_sos`=9, `insurance`=10, `chargeback_card`=11.
4. Widen `signatureProvider?: 'adobe_sign'` to `signatureProvider?: 'adobe_sign' | 'signwell'` (the runtime provider is chosen by env in Task 8; this field stays informational). Do not set it on `fcra_auth`.

- [ ] **Step 4: Skip SSN/DL collection for light-vetting invites**

In `src/app/api/public/onboarding/[token]/route.ts` (POST handler): wrap the sensitive-field validation and the `userSensitive/{uid}` batch write in `if (requiresHeavyVetting(invite.intendedFieldRole)) { ... }` (import from `@/types/onboarding`). When false, do not require `ssn`, `dlNumber`, or `backgroundCheckAuth` in the payload and do not create the `userSensitive` doc.

In `src/app/onboard/[token]/page.tsx`: the GET response already includes the invite's `intendedFieldRole` (verify via the `serializeInvite` shape; if absent, add it to the GET response). Conditionally render the SSN / DL# / background-authorization inputs only when `requiresHeavyVetting(intendedFieldRole)` — import the helper (it is client-safe, pure). The per-item upload/reference sections already follow `items` from the API, which Task 2 Step 3 filters correctly.

- [ ] **Step 5: Run tests, typecheck**

Run: `npm test` (full suite — `src/lib/onboarding/esign.test.ts` exercises `ESIGN_ITEM_IDS` and must still pass with the 4th item), then `npx tsc --noEmit`. Expected: all PASS, zero TS errors. If `esign.test.ts` asserts exactly three esign ids, update that assertion to include `fcra_auth` — the new behavior is intended.

- [ ] **Step 6: Commit**

```bash
git add src/types/onboarding.ts src/types/onboarding.test.ts src/app/api/public/onboarding src/app/onboard src/lib/onboarding/esign.test.ts
git commit -m "feat(onboarding): add FCRA esign item and role-filtered vetting for light roles"
```

---

### Task 3: Promotion-path warning

**Files:**
- Create: `src/lib/onboarding/promotionCheck.ts`
- Modify: `src/app/api/portal/auth/users/[id]/route.ts`
- Modify: `src/app/portal/admin/users/page.tsx` (and/or `src/components/admin/UserForm.tsx` — wherever the save handler lives)
- Test: `src/lib/onboarding/promotionCheck.test.ts`

**Interfaces:**
- Consumes: `LIGHT_VETTING_ROLES` (Task 1), `ONBOARDING_ITEMS`, `BASE_VETTING_ROLES` (Task 2), `OnboardingStatus`.
- Produces: `needsPromotionWarning(newFieldRole: FieldRole, itemStatuses: Record<string, OnboardingStatus>): boolean`; the PUT users route response gains an optional `promotionWarning: boolean` field.

- [ ] **Step 1: Write the failing test**

Create `src/lib/onboarding/promotionCheck.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { needsPromotionWarning, BASE_COMPLETION_ITEM_IDS } from './promotionCheck';
import type { OnboardingStatus } from '@/types/onboarding';

function allApproved(): Record<string, OnboardingStatus> {
  return Object.fromEntries(BASE_COMPLETION_ITEM_IDS.map((id) => [id, 'approved' as const]));
}

describe('needsPromotionWarning', () => {
  it('never warns for non-light roles', () => {
    expect(needsPromotionWarning('entry_rep', {})).toBe(false);
    expect(needsPromotionWarning('l1_manager', {})).toBe(false);
  });

  it('warns when a light role is assigned with no onboarding history', () => {
    expect(needsPromotionWarning('general_manager', {})).toBe(true);
    expect(needsPromotionWarning('office_manager', {})).toBe(true);
  });

  it('does not warn when all base items are approved', () => {
    expect(needsPromotionWarning('gm_in_training', allApproved())).toBe(false);
  });

  it('warns when any base item is not approved', () => {
    const statuses = allApproved();
    statuses['background_check'] = 'submitted';
    expect(needsPromotionWarning('general_manager', statuses)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/onboarding/promotionCheck.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/onboarding/promotionCheck.ts`**

```ts
import { LIGHT_VETTING_ROLES, type FieldRole } from '@/types/auth';
import {
  ONBOARDING_ITEMS,
  BASE_VETTING_ROLES,
  type OnboardingStatus,
} from '@/types/onboarding';

/** Items a base-role rep must complete: non-IBO items applicable to base roles. */
export const BASE_COMPLETION_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) =>
    !i.iboOnly &&
    (i.appliesToRoles.length === 0 ||
      i.appliesToRoles.some((r) => (BASE_VETTING_ROLES as readonly string[]).includes(r)))
).map((i) => i.id);

/**
 * True when assigning `newFieldRole` should surface the "never completed base
 * onboarding" warning (design decision 3).
 */
export function needsPromotionWarning(
  newFieldRole: FieldRole,
  itemStatuses: Record<string, OnboardingStatus>
): boolean {
  if (!(LIGHT_VETTING_ROLES as readonly string[]).includes(newFieldRole)) return false;
  return BASE_COMPLETION_ITEM_IDS.some((id) => itemStatuses[id] !== 'approved');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/onboarding/promotionCheck.test.ts` → PASS.

- [ ] **Step 5: Wire into the user-update route**

In `src/app/api/portal/auth/users/[id]/route.ts` PUT handler, after the fieldRole update is validated and written: if the incoming `fieldRole` is in `LIGHT_VETTING_ROLES`, load the user's onboarding statuses and include the flag in the response:

```ts
import { needsPromotionWarning } from '@/lib/onboarding/promotionCheck';
import { LIGHT_VETTING_ROLES } from '@/types/auth';
import type { OnboardingStatus } from '@/types/onboarding';

// after the users/{id} update succeeds, before building the response:
let promotionWarning = false;
if (fieldRole && (LIGHT_VETTING_ROLES as readonly string[]).includes(fieldRole)) {
  const snap = await adminDb
    .collection('userOnboarding')
    .where('userId', '==', id)
    .get();
  const statuses: Record<string, OnboardingStatus> = {};
  snap.forEach((d) => {
    statuses[d.get('itemId') as string] = d.get('status') as OnboardingStatus;
  });
  promotionWarning = needsPromotionWarning(fieldRole, statuses);
}
// include { promotionWarning } in the JSON success response
```

- [ ] **Step 6: Surface the warning in the admin UI**

In the save handler on `src/app/portal/admin/users/page.tsx` (or `src/components/admin/UserForm.tsx`, wherever the PUT response is consumed): when `promotionWarning === true`, show a dismissible amber banner using the page's existing error/success message pattern (reuse whatever state + markup the page uses for its error banner, restyled amber):

Text: `"{displayName} was assigned {RoleDisplayNames[fieldRole]} but has not completed base onboarding. Confirm this is an internal promotion."`

- [ ] **Step 7: Gates and commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/lib/onboarding/promotionCheck.ts src/lib/onboarding/promotionCheck.test.ts src/app/api/portal/auth/users src/app/portal/admin/users src/components/admin
git commit -m "feat(roles): warn when a light-vetting role is assigned without base onboarding"
```

---

### Task 4: Shared notification helper + new notification types

**Files:**
- Create: `src/lib/notifications/createNotification.ts`
- Modify: `src/types/notifications.ts`
- Modify: `src/app/api/portal/onboarding/review/route.ts` (replace its inline duplicate helper)
- Test: `src/lib/notifications/createNotification.test.ts`

**Interfaces:**
- Consumes: `adminDb` from `@/lib/firebase/admin`; `NotificationType` from `@/types/notifications`.
- Produces:
  - `createNotification(input: CreateNotificationInput): Promise<string>` (returns doc id)
  - `createNotificationForMany(userIds: string[], data: Omit<CreateNotificationInput, 'userId'>): Promise<void>`
  - `NotificationType` union extended with `'onboarding_nudge' | 'esign_completed' | 'activation_ready' | 'rep_activated' | 'pending_assignment' | 'alert_task'`

- [ ] **Step 1: Write the failing test**

Create `src/lib/notifications/createNotification.test.ts`. Mock the Admin SDK (mirror the mocking style of the existing `src/lib/forms/notifySubmission.test.ts` if it differs from below):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addMock = vi.fn(async () => ({ id: 'notif_1' }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ add: addMock })) },
}));

import { createNotification, createNotificationForMany } from './createNotification';

beforeEach(() => addMock.mockClear());

describe('createNotification', () => {
  it('writes a notification doc with read=false and returns the id', async () => {
    const id = await createNotification({
      userId: 'u1',
      type: 'onboarding_approved',
      title: 'Approved',
      message: 'Your W-9 was approved',
      link: '/portal/onboarding',
    });
    expect(id).toBe('notif_1');
    const doc = addMock.mock.calls[0][0];
    expect(doc.userId).toBe('u1');
    expect(doc.read).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('fans out to many users', async () => {
    await createNotificationForMany(['a', 'b', 'c'], {
      type: 'alert_task',
      title: 't',
      message: 'm',
    });
    expect(addMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/notifications/createNotification.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`src/lib/notifications/createNotification.ts`:

```ts
import { adminDb } from '@/lib/firebase/admin';
import type { NotificationType } from '@/types/notifications';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const ref = await adminDb.collection('notifications').add({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    ...(input.link ? { link: input.link } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    read: false,
    createdAt: new Date(),
  });
  return ref.id;
}

export async function createNotificationForMany(
  userIds: string[],
  data: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification({ ...data, userId })));
}
```

In `src/types/notifications.ts`, extend the union:

```ts
export type NotificationType =
  | 'sale_approved' | 'sale_rejected' | 'sale_pending' | 'points_earned'
  | 'leaderboard_rank' | 'onboarding_submitted' | 'onboarding_approved'
  | 'onboarding_rejected' | 'announcement' | 'system'
  | 'onboarding_nudge' | 'esign_completed' | 'activation_ready'
  | 'rep_activated' | 'pending_assignment' | 'alert_task';
```

Add matching entries to `NOTIFICATION_COLORS` (copy the color used by `onboarding_submitted` for the new onboarding types; `announcement`'s color for `alert_task`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/notifications/createNotification.test.ts` → PASS.

- [ ] **Step 5: Replace the review route's inline helper**

In `src/app/api/portal/onboarding/review/route.ts`, delete the local `createNotification` function and import the shared one from `@/lib/notifications/createNotification`. Adjust call sites to the `CreateNotificationInput` shape (same fields). Behavior must not change.

- [ ] **Step 6: Gates and commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/lib/notifications src/types/notifications.ts src/app/api/portal/onboarding/review/route.ts
git commit -m "feat(notifications): shared createNotification helper and new types"
```

---

### Task 5: Email service (Postmark) + templates + invite email

**Files:**
- Create: `src/lib/email/sendEmail.ts`
- Create: `src/lib/email/templates.ts`
- Modify: `src/app/api/portal/recruiting/invites/route.ts`
- Test: `src/lib/email/templates.test.ts`, `src/lib/email/sendEmail.test.ts`

**Interfaces:**
- Consumes: env `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `APP_BASE_URL`.
- Produces:
  - `sendEmail(input: { to: string; subject: string; htmlBody: string; textBody: string }): Promise<{ ok: boolean; error?: string }>` — never throws.
  - `EmailContent = { subject: string; htmlBody: string; textBody: string }`, `appBaseUrl(): string`, `NudgeTier = 'h24' | 'h72' | 'd7'`, and template functions `inviteEmail`, `nudgeEmail`, `itemRejectedEmail`, `esignSentEmail`, `activationEmail`, `managerAlertEmail` (signatures in Step 3).

- [ ] **Step 1: Write the failing tests**

`src/lib/email/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inviteEmail, nudgeEmail, activationEmail, managerAlertEmail } from './templates';

describe('email templates', () => {
  it('invite email contains the invite URL in html and text', () => {
    const e = inviteEmail({
      candidateName: 'Sam',
      ownerName: 'Jacob',
      inviteUrl: 'https://portal.test/onboard/tok123',
    });
    expect(e.subject.toLowerCase()).toContain('welcome');
    expect(e.htmlBody).toContain('https://portal.test/onboard/tok123');
    expect(e.textBody).toContain('https://portal.test/onboard/tok123');
  });

  it('nudge email escalates tone by tier', () => {
    const h24 = nudgeEmail({ name: 'Sam', tier: 'h24', portalUrl: 'https://portal.test/portal/onboarding' });
    const d7 = nudgeEmail({ name: 'Sam', tier: 'd7', portalUrl: 'https://portal.test/portal/onboarding' });
    expect(h24.subject).not.toEqual(d7.subject);
    expect(d7.htmlBody).toContain('https://portal.test/portal/onboarding');
  });

  it('activation and manager alert emails render', () => {
    expect(activationEmail({ name: 'Sam' }).subject.length).toBeGreaterThan(0);
    const m = managerAlertEmail({ title: 'Review needed', message: 'W-9 uploaded', link: 'https://portal.test/portal/admin/onboarding' });
    expect(m.htmlBody).toContain('Review needed');
  });
});
```

`src/lib/email/sendEmail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from './sendEmail';

const INPUT = { to: 'a@b.c', subject: 's', htmlBody: '<p>h</p>', textBody: 't' };

describe('sendEmail', () => {
  beforeEach(() => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'tok');
    vi.stubEnv('EMAIL_FROM', 'portal@example.com');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to Postmark with the server token header', async () => {
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(true);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect((init.headers as Record<string, string>)['X-Postmark-Server-Token']).toBe('tok');
    const body = JSON.parse(init.body as string);
    expect(body.From).toBe('portal@example.com');
    expect(body.To).toBe('a@b.c');
  });

  it('returns ok:false (never throws) when unconfigured', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns ok:false on non-2xx without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })));
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/email`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`src/lib/email/sendEmail.ts`:

```ts
const POSTMARK_URL = 'https://api.postmarkapp.com/email';

export interface EmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Sends via Postmark. NEVER throws: email failure must not break a flow.
 * Free dev tier: may be limited to own-domain recipients until the account
 * is approved for production sending.
 */
export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EMAIL_FROM;
  if (!token || !from) {
    console.warn('[email] not configured; skipping send:', input.subject);
    return { ok: false, error: 'not_configured' };
  }
  try {
    const res = await fetch(POSTMARK_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: input.to,
        Subject: input.subject,
        HtmlBody: input.htmlBody,
        TextBody: input.textBody,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      console.error('[email] postmark send failed', res.status, await res.text());
      return { ok: false, error: `postmark_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] postmark send threw', err);
    return { ok: false, error: 'network' };
  }
}
```

`src/lib/email/templates.ts`:

```ts
export interface EmailContent {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:24px;background:#f6f7f9">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<h2 style="margin:0 0 16px">${title}</h2>
${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#8a8f98">3C World Group Portal - automated message.</p>
</div></body></html>`;
}

export function inviteEmail(p: { candidateName: string; ownerName: string; inviteUrl: string }): EmailContent {
  const subject = 'Welcome to 3C World Group - start your onboarding';
  return {
    subject,
    textBody: `Hi ${p.candidateName},\n\n${p.ownerName} invited you to join the team. Complete your onboarding here: ${p.inviteUrl} (link expires in 14 days).\n`,
    htmlBody: layout(subject, `<p>Hi ${p.candidateName},</p><p>${p.ownerName} invited you to join the team.</p><p><a href="${p.inviteUrl}">Start your onboarding</a> (link expires in 14 days).</p><p>${p.inviteUrl}</p>`),
  };
}

export type NudgeTier = 'h24' | 'h72' | 'd7';

const NUDGE_COPY: Record<NudgeTier, { subject: string; line: string }> = {
  h24: { subject: 'Quick nudge: your onboarding is waiting', line: 'You are close - pick up where you left off and knock out the next step.' },
  h72: { subject: 'Still with us? Your onboarding needs you', line: 'Your onboarding has been idle for a few days. Your manager has been looped in and can help if you are stuck.' },
  d7: { subject: 'Final reminder: complete your onboarding', line: 'It has been a week without progress. Finish your remaining steps to keep your spot on the team.' },
};

export function nudgeEmail(p: { name: string; tier: NudgeTier; portalUrl: string }): EmailContent {
  const c = NUDGE_COPY[p.tier];
  return {
    subject: c.subject,
    textBody: `Hi ${p.name},\n\n${c.line}\n\nContinue: ${p.portalUrl}\n`,
    htmlBody: layout(c.subject, `<p>Hi ${p.name},</p><p>${c.line}</p><p><a href="${p.portalUrl}">Continue onboarding</a></p><p>${p.portalUrl}</p>`),
  };
}

export function itemRejectedEmail(p: { name: string; itemLabel: string; reason: string; portalUrl: string }): EmailContent {
  const subject = `Action needed: ${p.itemLabel} was returned`;
  return {
    subject,
    textBody: `Hi ${p.name},\n\nYour "${p.itemLabel}" submission was returned: ${p.reason}\n\nFix it here: ${p.portalUrl}\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>Your <strong>${p.itemLabel}</strong> submission was returned:</p><blockquote>${p.reason}</blockquote><p><a href="${p.portalUrl}">Resubmit</a></p>`),
  };
}

export function esignSentEmail(p: { name: string; docLabels: string[] }): EmailContent {
  const subject = 'Documents sent for your signature';
  const list = p.docLabels.join(', ');
  return {
    subject,
    textBody: `Hi ${p.name},\n\nWe just emailed you the following for e-signature: ${list}. Check your inbox (and spam folder).\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>We just emailed you the following for e-signature: <strong>${list}</strong>.</p><p>Check your inbox (and spam folder).</p>`),
  };
}

export function activationEmail(p: { name: string }): EmailContent {
  const subject = 'You are officially active - welcome aboard';
  return {
    subject,
    textBody: `Hi ${p.name},\n\nYour onboarding is complete and your account is now active. Welcome to the team!\n\n${appBaseUrl()}/portal\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>Your onboarding is complete and your account is now <strong>active</strong>. Welcome to the team!</p><p><a href="${appBaseUrl()}/portal">Open the portal</a></p>`),
  };
}

export function managerAlertEmail(p: { title: string; message: string; link: string }): EmailContent {
  return {
    subject: `[Portal] ${p.title}`,
    textBody: `${p.title}\n\n${p.message}\n\n${p.link}\n`,
    htmlBody: layout(p.title, `<p>${p.message}</p><p><a href="${p.link}">Open in portal</a></p>`),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/email` → PASS.

- [ ] **Step 5: Auto-send the invite email**

In `src/app/api/portal/recruiting/invites/route.ts` POST handler, after the invite doc is written and `inviteUrl` is built, add a fire-and-forget send (keep returning `inviteUrl` in the response so manual sharing still works):

```ts
import { sendEmail } from '@/lib/email/sendEmail';
import { inviteEmail } from '@/lib/email/templates';

void sendEmail({
  to: candidateEmail,
  ...inviteEmail({ candidateName, ownerName, inviteUrl }),
}).catch(() => {});
```

(Use the actual local variable names in that handler for the candidate name/email and owner name.)

- [ ] **Step 6: Gates and commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/lib/email src/app/api/portal/recruiting/invites/route.ts
git commit -m "feat(email): Postmark sender, transactional templates, auto-send invites"
```

---

### Task 6: Alert dispatch — in-app + email + push in one call (activates FCM)

**Files:**
- Create: `src/lib/alerts/dispatch.ts`
- Test: `src/lib/alerts/dispatch.test.ts`

**Interfaces:**
- Consumes: `createNotification` (Task 4), `sendEmail`/`EmailContent` (Task 5), `sendPushToUser(uid, { title, body, url? })` from `@/lib/push/sendPush` (existing, currently zero callers — this task activates it), `adminDb`.
- Produces: `dispatchToUser(input: DispatchInput): Promise<void>` — later tasks (7, 9-12) call ONLY this for anything user-facing.

- [ ] **Step 1: Write the failing test**

`src/lib/alerts/dispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createNotificationMock = vi.fn(async () => 'n1');
const sendEmailMock = vi.fn(async () => ({ ok: true }));
const sendPushMock = vi.fn(async () => undefined);
const getMock = vi.fn(async () => ({ get: (f: string) => (f === 'email' ? 'rep@x.com' : undefined) }));

vi.mock('@/lib/notifications/createNotification', () => ({ createNotification: createNotificationMock }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: sendPushMock }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: vi.fn(() => ({ get: getMock })) } }));

import { dispatchToUser } from './dispatch';

beforeEach(() => {
  createNotificationMock.mockClear();
  sendEmailMock.mockClear();
  sendPushMock.mockClear();
});

describe('dispatchToUser', () => {
  it('sends in-app + push always, email when content provided', async () => {
    await dispatchToUser({
      userId: 'u1',
      type: 'onboarding_nudge',
      title: 'T',
      message: 'M',
      link: '/portal/onboarding',
      email: { subject: 's', htmlBody: 'h', textBody: 't' },
    });
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(sendPushMock).toHaveBeenCalledWith('u1', { title: 'T', body: 'M', url: '/portal/onboarding' });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'rep@x.com', subject: 's' }));
  });

  it('does not reject when push throws', async () => {
    sendPushMock.mockRejectedValueOnce(new Error('fcm down'));
    await expect(
      dispatchToUser({ userId: 'u1', type: 'system', title: 'T', message: 'M' })
    ).resolves.toBeUndefined();
    expect(createNotificationMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/alerts/dispatch.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/alerts/dispatch.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendEmail } from '@/lib/email/sendEmail';
import type { EmailContent } from '@/lib/email/templates';
import { sendPushToUser } from '@/lib/push/sendPush';
import type { NotificationType } from '@/types/notifications';

export interface DispatchInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  email?: EmailContent;
  metadata?: Record<string, unknown>;
}

/**
 * One call = all three channels: in-app bell (always), FCM push (best-effort),
 * email (only when content provided). Push/email failures are logged, never thrown.
 */
export async function dispatchToUser(input: DispatchInput): Promise<void> {
  await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    metadata: input.metadata,
  });

  const results = await Promise.allSettled([
    sendPushToUser(input.userId, { title: input.title, body: input.message, url: input.link }),
    input.email
      ? (async () => {
          const snap = await adminDb.doc(`users/${input.userId}`).get();
          const to = snap.get('email') as string | undefined;
          if (to) await sendEmail({ to, ...input.email! });
        })()
      : Promise.resolve(),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('[dispatch] channel failed', r.reason);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/alerts/dispatch.test.ts` → PASS.

- [ ] **Step 5: Gates and commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/lib/alerts
git commit -m "feat(alerts): dispatchToUser fanning out to bell, push, and email"
```

---

### Task 7: Broadcast + claim alert engine (`alertTasks`)

**Files:**
- Create: `src/types/alerts.ts`
- Create: `src/lib/alerts/alertTasks.ts`
- Create: `src/app/api/portal/alerts/route.ts` (GET list)
- Create: `src/app/api/portal/alerts/claim/route.ts` (POST claim)
- Modify: `firestore.rules` (lock `alertTasks`)
- Test: `src/lib/alerts/alertTasks.test.ts`

**Interfaces:**
- Consumes: `MANAGEMENT_FIELD_ROLES` (Task 1), `createNotificationForMany` (Task 4), `managerAlertEmail`/`appBaseUrl`/`sendEmail` (Task 5), `sendPushToUser`, `adminDb`, `requireManagement` from `@/lib/auth/requireManagement`.
- Produces:
  - `AlertTaskKind = 'review_needed' | 'stalled_rep' | 'pending_assignment' | 'activation_ready'`
  - `createAlertTask(input: NewAlertTask): Promise<string>` — broadcasts to all management users; dedupes on an existing open/claimed task of same kind+subjectUserId
  - `claimAlertTask(taskId: string, uid: string, name: string): Promise<'claimed' | 'already_claimed' | 'not_found'>`
  - `resolveAlertTasks(subjectUserId: string, kinds?: AlertTaskKind[]): Promise<void>`
  - `shouldRenag(task, now, thresholdMs?): boolean` (pure) and `renagStaleTasks(now: Date): Promise<number>`
  - `GET /api/portal/alerts?requestedBy=` → `{ tasks: AlertTask[] }`; `POST /api/portal/alerts/claim` body `{ requestedBy, taskId }`.

- [ ] **Step 1: Write the failing test (pure logic)**

`src/lib/alerts/alertTasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldRenag } from './alertTasks';

const HOUR = 3600 * 1000;

describe('shouldRenag', () => {
  const now = new Date('2026-07-08T12:00:00Z');

  it('re-nags open tasks 24h after creation', () => {
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 25 * HOUR) }, now)).toBe(true);
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 23 * HOUR) }, now)).toBe(false);
  });

  it('uses lastNaggedAt when present', () => {
    const task = {
      status: 'open' as const,
      createdAt: new Date(now.getTime() - 100 * HOUR),
      lastNaggedAt: new Date(now.getTime() - 2 * HOUR),
    };
    expect(shouldRenag(task, now)).toBe(false);
  });

  it('never re-nags claimed or resolved tasks', () => {
    const old = new Date(now.getTime() - 100 * HOUR);
    expect(shouldRenag({ status: 'claimed', createdAt: old }, now)).toBe(false);
    expect(shouldRenag({ status: 'resolved', createdAt: old }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/alerts/alertTasks.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement types and lib**

`src/types/alerts.ts`:

```ts
export type AlertTaskKind = 'review_needed' | 'stalled_rep' | 'pending_assignment' | 'activation_ready';
export type AlertTaskStatus = 'open' | 'claimed' | 'resolved';

export interface AlertTask {
  id: string;
  kind: AlertTaskKind;
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
  status: AlertTaskStatus;
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: Date;
  resolvedAt?: Date;
  lastNaggedAt?: Date;
  createdAt: Date;
}
```

`src/lib/alerts/alertTasks.ts`:

```ts
import { adminDb } from '@/lib/firebase/admin';
import { MANAGEMENT_FIELD_ROLES } from '@/types/auth';
import type { AlertTaskKind } from '@/types/alerts';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import { managerAlertEmail, appBaseUrl } from '@/lib/email/templates';

const RENAG_MS = 24 * 3600 * 1000;

export interface NewAlertTask {
  kind: AlertTaskKind;
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
}

/** All admin/operations users plus active management field-role users. */
export async function getManagementUserIds(): Promise<string[]> {
  const [platform, field] = await Promise.all([
    adminDb.collection('users').where('role', 'in', ['admin', 'operations']).get(),
    adminDb.collection('users').where('fieldRole', 'in', [...MANAGEMENT_FIELD_ROLES]).get(),
  ]);
  const ids = new Set<string>();
  platform.forEach((d) => { if (d.get('status') !== 'inactive') ids.add(d.id); });
  field.forEach((d) => { if (d.get('status') === 'active') ids.add(d.id); });
  return [...ids];
}

async function broadcast(task: NewAlertTask & { id: string }): Promise<void> {
  const userIds = await getManagementUserIds();
  await createNotificationForMany(userIds, {
    type: 'alert_task',
    title: task.title,
    message: task.message,
    link: task.link,
    metadata: { alertTaskId: task.id, kind: task.kind },
  });
  const email = managerAlertEmail({ title: task.title, message: task.message, link: `${appBaseUrl()}${task.link}` });
  const results = await Promise.allSettled(
    userIds.flatMap((uid) => [
      sendPushToUser(uid, { title: task.title, body: task.message, url: task.link }),
      (async () => {
        const snap = await adminDb.doc(`users/${uid}`).get();
        const to = snap.get('email') as string | undefined;
        if (to) await sendEmail({ to, ...email });
      })(),
    ])
  );
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('[alertTasks] broadcast channel failed', r.reason);
  });
}

/** Creates and broadcasts; returns existing id when an open/claimed duplicate exists. */
export async function createAlertTask(input: NewAlertTask): Promise<string> {
  const existing = await adminDb
    .collection('alertTasks')
    .where('kind', '==', input.kind)
    .where('subjectUserId', '==', input.subjectUserId)
    .where('status', 'in', ['open', 'claimed'])
    .limit(1)
    .get();
  if (!existing.empty) return existing.docs[0].id;

  const ref = await adminDb.collection('alertTasks').add({
    ...input,
    status: 'open',
    createdAt: new Date(),
  });
  await broadcast({ ...input, id: ref.id });
  return ref.id;
}

export async function claimAlertTask(
  taskId: string,
  uid: string,
  name: string
): Promise<'claimed' | 'already_claimed' | 'not_found'> {
  const ref = adminDb.doc(`alertTasks/${taskId}`);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'not_found';
    if (snap.get('status') !== 'open') return 'already_claimed';
    tx.update(ref, { status: 'claimed', claimedBy: uid, claimedByName: name, claimedAt: new Date() });
    return 'claimed';
  });
}

/** Marks matching open/claimed tasks resolved (e.g., after activation). */
export async function resolveAlertTasks(subjectUserId: string, kinds?: AlertTaskKind[]): Promise<void> {
  const snap = await adminDb
    .collection('alertTasks')
    .where('subjectUserId', '==', subjectUserId)
    .where('status', 'in', ['open', 'claimed'])
    .get();
  const now = new Date();
  await Promise.all(
    snap.docs
      .filter((d) => !kinds || kinds.includes(d.get('kind') as AlertTaskKind))
      .map((d) => d.ref.update({ status: 'resolved', resolvedAt: now }))
  );
}

/** Pure: open tasks re-nag the whole group every 24h until claimed. */
export function shouldRenag(
  task: { status: string; createdAt: Date; lastNaggedAt?: Date },
  now: Date,
  thresholdMs: number = RENAG_MS
): boolean {
  if (task.status !== 'open') return false;
  const last = task.lastNaggedAt ?? task.createdAt;
  return now.getTime() - last.getTime() >= thresholdMs;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const v = value as { toDate?: () => Date };
  return typeof v.toDate === 'function' ? v.toDate() : (value as Date);
}

/** Called by the cron (Task 11). Returns count of tasks re-nagged. */
export async function renagStaleTasks(now: Date): Promise<number> {
  const snap = await adminDb.collection('alertTasks').where('status', '==', 'open').get();
  let count = 0;
  for (const doc of snap.docs) {
    const task = {
      status: doc.get('status') as string,
      createdAt: toDate(doc.get('createdAt'))!,
      lastNaggedAt: toDate(doc.get('lastNaggedAt')),
    };
    if (!shouldRenag(task, now)) continue;
    await broadcast({
      kind: doc.get('kind'),
      subjectUserId: doc.get('subjectUserId'),
      subjectName: doc.get('subjectName'),
      title: `Still unclaimed: ${doc.get('title')}`,
      message: doc.get('message'),
      link: doc.get('link'),
      id: doc.id,
    });
    await doc.ref.update({ lastNaggedAt: now });
    count += 1;
  }
  return count;
}
```

Note: the `kind`/`subjectUserId`/`status in [...]` query needs a composite index. First run logs an index-creation URL — create it; if the repo tracks `firestore.indexes.json`, add it there and commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/alerts/alertTasks.test.ts` → PASS.

- [ ] **Step 5: API routes**

BEFORE writing these, open `src/app/api/portal/onboarding/review/route.ts` and copy its exact `requireManagement` consumption pattern (gate shape, error-response style). The code below assumes `requireManagement(uid)` returns a gate with `ok/status/error/user`; adjust to the real shape.

`src/app/api/portal/alerts/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedBy = searchParams.get('requestedBy') ?? '';
  const gate = await requireManagement(requestedBy);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const snap = await adminDb
    .collection('alertTasks')
    .where('status', 'in', ['open', 'claimed'])
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const tasks = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      claimedAt: data.claimedAt?.toDate?.()?.toISOString?.() ?? null,
      lastNaggedAt: data.lastNaggedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });
  return NextResponse.json({ tasks });
}
```

`src/app/api/portal/alerts/claim/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireManagement } from '@/lib/auth/requireManagement';
import { claimAlertTask } from '@/lib/alerts/alertTasks';

export async function POST(request: Request) {
  const body = (await request.json()) as { requestedBy?: string; taskId?: string };
  const { requestedBy, taskId } = body;
  if (!requestedBy || !taskId) {
    return NextResponse.json({ error: 'requestedBy and taskId are required' }, { status: 400 });
  }
  const gate = await requireManagement(requestedBy);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const result = await claimAlertTask(taskId, requestedBy, gate.user.displayName ?? 'Manager');
  if (result === 'not_found') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (result === 'already_claimed') return NextResponse.json({ error: 'already claimed' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Firestore rules**

Add to `firestore.rules`:

```
match /alertTasks/{taskId} {
  allow read, write: if false;
}
```

- [ ] **Step 7: Gates and commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/types/alerts.ts src/lib/alerts src/app/api/portal/alerts firestore.rules
git commit -m "feat(alerts): broadcast+claim alertTasks engine with 24h re-nag"
```

---

### Task 8: `EsignProvider` interface + SignWell implementation

**Files:**
- Create: `src/lib/esign/provider.ts`
- Create: `src/lib/esign/signwell.ts`
- Modify: `src/lib/onboarding/esign.ts` (provider-neutral copy)
- Test: `src/lib/esign/signwell.test.ts`

**Interfaces:**
- Consumes: env `ESIGN_PROVIDER`, `SIGNWELL_API_KEY`, `SIGNWELL_TEST_MODE`.
- Produces (everything downstream depends on these EXACT names):

```ts
export type EsignDocKey = 'contract' | 'direct_deposit' | 'pay_structure' | 'fcra_auth';

export interface EnvelopeRequest {
  docKey: EsignDocKey;
  userId: string;
  itemId: string;
  signerName: string;
  signerEmail: string;
  prefill?: Record<string, string>;
}

export interface EnvelopeResult { envelopeId: string; }

export interface EsignWebhookEvent {
  envelopeId: string;
  status: 'completed' | 'declined' | 'other';
  metadata: { userId?: string; itemId?: string };
}

export interface EsignProvider {
  id: 'signwell' | 'adobe_sign';
  createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult>;
  /** Returns null when the payload fails signature verification. */
  parseWebhook(rawBody: string, headers: Headers): Promise<EsignWebhookEvent | null>;
}

export function getEsignProvider(): EsignProvider; // ESIGN_PROVIDER env, default 'signwell'
```

- [ ] **Step 0: Verify SignWell API shape**

The request/response field names below are from SignWell's v1 API as understood at plan time. Before implementing, fetch current SignWell docs (context7 or https://developers.signwell.com) and confirm: the create-document endpoint path, raw `files`/2-D `fields` request shape, `metadata` passthrough, and the webhook payload/hash-verification scheme. Adjust FIELD NAMES only — the `EsignProvider` interface above must not change.

- [ ] **Step 1: Write the failing test**

`src/lib/esign/signwell.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySignwellHash, signwellProvider } from './signwell';
import { createHmac } from 'node:crypto';

describe('verifySignwellHash', () => {
  it('accepts a correct HMAC and rejects a wrong one', () => {
    const key = 'sw_key';
    const good = createHmac('sha256', key).update('document_completed@1751970000').digest('hex');
    expect(verifySignwellHash('document_completed', '1751970000', good, key)).toBe(true);
    expect(verifySignwellHash('document_completed', '1751970000', 'deadbeef', key)).toBe(false);
  });
});

describe('signwellProvider.createEnvelope', () => {
  beforeEach(() => {
    vi.stubEnv('SIGNWELL_API_KEY', 'sw_key');
    vi.stubEnv('SIGNWELL_TEST_MODE', 'true');
    vi.stubEnv('SIGNWELL_API_KEY', 'sw_key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'doc_123' }), { status: 201 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts the template document with metadata and returns the envelope id', async () => {
    const result = await signwellProvider.createEnvelope({
      docKey: 'contract',
      userId: 'u1',
      itemId: 'contract',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
    });
    expect(result.envelopeId).toBe('doc_123');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.files[0].file_base64).toEqual(expect.any(String));
    expect(body.metadata).toEqual({ userId: 'u1', itemId: 'contract' });
    expect(body.recipients[0].email).toBe('sam@x.com');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('sw_key');
  });

  it('throws a descriptive error when the template env is missing', async () => {
    vi.stubEnv('SIGNWELL_API_KEY', '');
    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).rejects.toThrow(/SIGNWELL_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/esign` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/lib/esign/provider.ts` — exactly the interface block from **Produces** above, plus:

```ts
import { signwellProvider } from './signwell';

export function getEsignProvider(): EsignProvider {
  const id = process.env.ESIGN_PROVIDER ?? 'signwell';
  if (id === 'signwell') return signwellProvider;
  if (id === 'adobe_sign') {
    // Adobe Sign pending API-tier confirmation (design open item, 2026-07-08).
    throw new Error('adobe_sign provider not implemented yet; set ESIGN_PROVIDER=signwell');
  }
  throw new Error(`Unknown ESIGN_PROVIDER: ${id}`);
}
```

`src/lib/esign/signwell.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EsignProvider, EsignDocKey, EnvelopeRequest, EnvelopeResult, EsignWebhookEvent } from './provider';

const SIGNWELL_BASE = 'https://www.signwell.com/api/v1';

function requireApiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error('SIGNWELL_API_KEY is not set');
  return key;
}

// Template-free flow reads assets/esign PDFs and posts files/fields to /documents.

export function verifySignwellHash(eventType: string, eventTime: string, hash: string, apiKey: string): boolean {
  const expected = createHmac('sha256', apiKey).update(`${eventType}@${eventTime}`).digest('hex');
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export const signwellProvider: EsignProvider = {
  id: 'signwell',

  async createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult> {
    const res = await fetch(`${SIGNWELL_BASE}/documents`, {
      method: 'POST',
      headers: {
        'X-Api-Key': requireApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test_mode: process.env.SIGNWELL_TEST_MODE === 'true',
        name: req.docKey,
        embedded_signing: false,
        metadata: { userId: req.userId, itemId: req.itemId },
        recipients: [
          { id: 'signer', name: req.signerName, email: req.signerEmail },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`SignWell createEnvelope failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return { envelopeId: data.id };
  },

  async parseWebhook(rawBody: string): Promise<EsignWebhookEvent | null> {
    let payload: {
      event?: { type?: string; time?: string | number; hash?: string };
      data?: { object?: { id?: string; metadata?: { userId?: string; itemId?: string } } };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const type = String(payload.event?.type ?? '');
    const time = String(payload.event?.time ?? '');
    const hash = String(payload.event?.hash ?? '');
    if (!verifySignwellHash(type, time, hash, requireApiKey())) return null;

    const obj = payload.data?.object;
    const envelopeId = String(obj?.id ?? '');
    const metadata = { userId: obj?.metadata?.userId, itemId: obj?.metadata?.itemId };
    if (type === 'document_completed') return { envelopeId, status: 'completed', metadata };
    if (type === 'document_declined') return { envelopeId, status: 'declined', metadata };
    return { envelopeId, status: 'other', metadata };
  },
};
```

- [ ] **Step 4: Provider-neutral helper copy**

In `src/lib/onboarding/esign.ts`: change `ESIGN_HELPER_TEXT` to `"We've emailed you this document for e-signature. Check your inbox - it completes here automatically once signed."`. Remove `ADOBE_SIGN_DASHBOARD_URL` and fix its usages (grep for it; replace any rendered link with nothing or the helper text). Keep `ESIGN_ITEM_IDS`/`isEsignItem` as-is.

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npm test`, `npx tsc --noEmit` → clean.

```bash
git add src/lib/esign src/lib/onboarding/esign.ts
git commit -m "feat(esign): provider-agnostic EsignProvider with SignWell implementation"
```

---

### Task 9: E-sign auto-send + completion webhook

**Files:**
- Create: `src/lib/esign/autoSend.ts`
- Create: `src/app/api/webhooks/esign/route.ts`
- Modify: `src/app/api/public/onboarding/[token]/route.ts` (trigger after candidate submit)
- Test: `src/lib/esign/autoSend.test.ts`

**Interfaces:**
- Consumes: `getEsignProvider`, `EsignDocKey` (Task 8), `getOnboardingItemsForUser` + `ONBOARDING_ITEMS` (Task 2), `dispatchToUser` (Task 6), `esignSentEmail` (Task 5), `adminDb`.
- Produces: `sendPendingEsignDocs(userId: string): Promise<string[]>` (returns itemIds sent). `userOnboarding` docs gain an `esignEnvelopeId?: string` field; an e-sign item awaiting signature has `status: 'submitted'`, `reference: 'esign:<envelopeId>'`. Webhook completion sets `status: 'approved'`, `reviewedBy: 'system'`.

- [ ] **Step 1: Write the failing test**

`src/lib/esign/autoSend.test.ts` — mock firestore + provider; verify: sends only applicable, not-yet-sent esign items; marks them submitted; skips items with an existing `esignEnvelopeId`; continues past a provider failure on one item.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, Record<string, unknown>>();
const docMock = vi.fn((path: string) => ({
  get: async () => ({
    exists: store.has(path),
    get: (f: string) => store.get(path)?.[f],
    data: () => store.get(path),
  }),
  set: async (data: Record<string, unknown>) => {
    store.set(path, { ...(store.get(path) ?? {}), ...data });
  },
}));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: docMock } }));

const createEnvelopeMock = vi.fn(async () => ({ envelopeId: 'env_1' }));
vi.mock('./provider', () => ({
  getEsignProvider: () => ({ id: 'signwell', createEnvelope: createEnvelopeMock, parseWebhook: vi.fn() }),
}));

const dispatchMock = vi.fn(async () => undefined);
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));

import { sendPendingEsignDocs } from './autoSend';

beforeEach(() => {
  store.clear();
  createEnvelopeMock.mockClear();
  dispatchMock.mockClear();
  store.set('users/u1', {
    fieldRole: 'entry_rep', isIBO: false,
    displayName: 'Sam Rep', email: 'sam@x.com', status: 'pending',
  });
});

describe('sendPendingEsignDocs', () => {
  it('creates envelopes for all applicable unsent esign items and marks them submitted', async () => {
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure']);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(4);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_1',
    });
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('skips items that already have an envelope', async () => {
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_0' });
    const sent = await sendPendingEsignDocs('u1');
    expect(sent).not.toContain('contract');
  });

  it('continues when one envelope creation fails', async () => {
    createEnvelopeMock.mockRejectedValueOnce(new Error('signwell 500'));
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/esign/autoSend.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/esign/autoSend.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import type { FieldRole } from '@/types/auth';
import { getEsignProvider } from './provider';
import type { EsignDocKey } from './provider';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { esignSentEmail } from '@/lib/email/templates';

const ESIGN_DOC_KEYS = new Set(['contract', 'direct_deposit', 'pay_structure', 'fcra_auth']);

/**
 * Creates e-sign envelopes for every applicable esign item the user hasn't
 * been sent yet. Idempotent: items with an esignEnvelopeId are skipped.
 * Returns the itemIds actually sent.
 */
export async function sendPendingEsignDocs(userId: string): Promise<string[]> {
  const userSnap = await adminDb.doc(`users/${userId}`).get();
  if (!userSnap.exists) return [];
  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!fieldRole) return [];
  const signerName = (userSnap.get('displayName') as string) ?? 'Rep';
  const signerEmail = userSnap.get('email') as string | undefined;
  if (!signerEmail) return [];

  const items = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO')).filter(
    (i) => i.referenceKind === 'esign' && ESIGN_DOC_KEYS.has(i.id)
  );
  const provider = getEsignProvider();
  const sent: string[] = [];
  const sentLabels: string[] = [];

  for (const item of items) {
    const ref = adminDb.doc(`userOnboarding/${userId}_${item.id}`);
    const snap = await ref.get();
    const status = (snap.get('status') as string | undefined) ?? 'not_started';
    if (status !== 'not_started' && status !== 'rejected') continue;
    if (snap.get('esignEnvelopeId')) continue;
    try {
      const { envelopeId } = await provider.createEnvelope({
        docKey: item.id as EsignDocKey,
        userId,
        itemId: item.id,
        signerName,
        signerEmail,
      });
      await ref.set(
        {
          userId,
          itemId: item.id,
          status: 'submitted',
          reference: `esign:${envelopeId}`,
          esignEnvelopeId: envelopeId,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      sent.push(item.id);
      sentLabels.push(item.label);
    } catch (err) {
      console.error(`[esign] envelope creation failed for ${userId}/${item.id}`, err);
    }
  }

  if (sent.length > 0) {
    await dispatchToUser({
      userId,
      type: 'system',
      title: 'Documents sent for signature',
      message: `Check your email: ${sentLabels.join(', ')}`,
      link: '/portal/onboarding',
      email: esignSentEmail({ name: signerName, docLabels: sentLabels }),
    });
  }
  return sent;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/esign/autoSend.test.ts` → PASS.

- [ ] **Step 5: Webhook route**

`src/app/api/webhooks/esign/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getEsignProvider } from '@/lib/esign/provider';
import { createNotification } from '@/lib/notifications/createNotification';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

export async function POST(request: Request) {
  const raw = await request.text();
  const event = await getEsignProvider().parseWebhook(raw, request.headers);
  if (!event) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  if (event.status !== 'completed') return NextResponse.json({ ok: true });

  const { userId, itemId } = event.metadata;
  if (!userId || !itemId) {
    console.error('[esign webhook] completed event missing metadata', event.envelopeId);
    return NextResponse.json({ ok: true });
  }

  await adminDb.doc(`userOnboarding/${userId}_${itemId}`).set(
    {
      userId,
      itemId,
      status: 'approved',
      reviewedBy: 'system',
      reviewerName: 'E-sign (auto)',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  const label = ONBOARDING_ITEMS.find((i) => i.id === itemId)?.label ?? itemId;
  await createNotification({
    userId,
    type: 'esign_completed',
    title: 'Document signed',
    message: `${label} is complete.`,
    link: '/portal/onboarding',
  });
  return NextResponse.json({ ok: true });
}
```

(Task 10 adds a `maybeFlagActivationReady(userId)` call here.)

- [ ] **Step 6: Trigger auto-send after candidate submit**

In `src/app/api/public/onboarding/[token]/route.ts` POST handler, after the batch commit succeeds and before returning:

```ts
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';

void sendPendingEsignDocs(uid).catch((err) =>
  console.error('[onboarding] esign auto-send failed', err)
);
```

- [ ] **Step 7: Gates and commit**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` → clean.

```bash
git add src/lib/esign src/app/api/webhooks src/app/api/public/onboarding
git commit -m "feat(esign): auto-send envelopes on submit, webhook auto-completes items"
```

Manual setup note (do not automate): do not create SignWell templates for this flow; use the code-backed PDF assets and register the webhook URL `https://<prod-domain>/api/webhooks/esign` in the SignWell dashboard.

---

### Task 10: Activation gate — readiness, activate route, convert semantics change

**Files:**
- Create: `src/lib/onboarding/activation.ts`
- Create: `src/app/api/portal/onboarding/activate/route.ts`
- Modify: `src/app/api/portal/recruiting/convert/route.ts`
- Modify: `src/app/api/portal/onboarding/review/route.ts` (flag readiness on approve)
- Modify: `src/app/api/webhooks/esign/route.ts` (flag readiness on completion)
- Test: `src/lib/onboarding/activation.test.ts`

**Interfaces:**
- Consumes: `getOnboardingItemsForUser` (Task 2), `createAlertTask`/`resolveAlertTasks` (Task 7), `dispatchToUser` (Task 6), `activationEmail` (Task 5), `requireManagement`, `adminDb`.
- Produces:
  - `computeReadiness(applicable: OnboardingItem[], statuses: Record<string, OnboardingStatus>): { ready: boolean; missing: string[] }` (pure)
  - `getActivationReadiness(userId: string): Promise<{ ready: boolean; missing: string[] }>`
  - `maybeFlagActivationReady(userId: string): Promise<void>` — creates an `activation_ready` alertTask when a pending user goes all-green
  - `POST /api/portal/onboarding/activate` body `{ requestedBy, userId }` → 200 on activation, 409 `{ missing }` when not ready.

**BEHAVIOR CHANGE (intentional, design decision 6):** `convert` approve no longer sets `status:'active'`/`hireDate`. Candidate acceptance and rep activation become two distinct human touchpoints; activation now requires all checklist items approved (background screen pass included — the admin records pass/fail by approving/rejecting the `background_check` item in the review queue) plus a manager's explicit activate click.

- [ ] **Step 1: Write the failing test**

`src/lib/onboarding/activation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeReadiness } from './activation';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import type { OnboardingStatus } from '@/types/onboarding';

describe('computeReadiness', () => {
  const items = getOnboardingItemsForUser('entry_rep', false);

  it('not ready when nothing is approved', () => {
    const r = computeReadiness(items, {});
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('background_check');
  });

  it('ready when every applicable item is approved', () => {
    const statuses = Object.fromEntries(items.map((i) => [i.id, 'approved' as OnboardingStatus]));
    expect(computeReadiness(items, statuses)).toEqual({ ready: true, missing: [] });
  });

  it('a rejected background screen blocks activation', () => {
    const statuses = Object.fromEntries(items.map((i) => [i.id, 'approved' as OnboardingStatus]));
    statuses['background_check'] = 'rejected';
    const r = computeReadiness(items, statuses);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['background_check']);
  });

  it('light-vetting roles are ready without screen items', () => {
    const gmItems = getOnboardingItemsForUser('general_manager', false);
    const statuses = Object.fromEntries(gmItems.map((i) => [i.id, 'approved' as OnboardingStatus]));
    expect(computeReadiness(gmItems, statuses).ready).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/onboarding/activation.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/onboarding/activation.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin';
import {
  getOnboardingItemsForUser,
  type OnboardingItem,
  type OnboardingStatus,
} from '@/types/onboarding';
import type { FieldRole } from '@/types/auth';
import { createAlertTask } from '@/lib/alerts/alertTasks';

export function computeReadiness(
  applicable: OnboardingItem[],
  statuses: Record<string, OnboardingStatus>
): { ready: boolean; missing: string[] } {
  const missing = applicable.filter((i) => statuses[i.id] !== 'approved').map((i) => i.id);
  return { ready: missing.length === 0, missing };
}

async function loadStatuses(userId: string): Promise<Record<string, OnboardingStatus>> {
  const snap = await adminDb.collection('userOnboarding').where('userId', '==', userId).get();
  const statuses: Record<string, OnboardingStatus> = {};
  snap.forEach((d) => {
    statuses[d.get('itemId') as string] = d.get('status') as OnboardingStatus;
  });
  return statuses;
}

export async function getActivationReadiness(
  userId: string
): Promise<{ ready: boolean; missing: string[] }> {
  const userSnap = await adminDb.doc(`users/${userId}`).get();
  const fieldRole = userSnap.get('fieldRole') as FieldRole | undefined;
  if (!userSnap.exists || !fieldRole) return { ready: false, missing: ['fieldRole'] };
  const applicable = getOnboardingItemsForUser(fieldRole, !!userSnap.get('isIBO'));
  return computeReadiness(applicable, await loadStatuses(userId));
}

/** Call after any item approval. Alerts management when a pending user goes all-green. */
export async function maybeFlagActivationReady(userId: string): Promise<void> {
  const userSnap = await adminDb.doc(`users/${userId}`).get();
  if (!userSnap.exists || userSnap.get('status') !== 'pending') return;
  const { ready } = await getActivationReadiness(userId);
  if (!ready) return;
  const name = (userSnap.get('displayName') as string) ?? userId;
  await createAlertTask({
    kind: 'activation_ready',
    subjectUserId: userId,
    subjectName: name,
    title: `${name} is ready to activate`,
    message: 'All onboarding items are approved. One click to make them active.',
    link: '/portal/admin/onboarding',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/onboarding/activation.test.ts` → PASS.

- [ ] **Step 5: Activate route**

`src/app/api/portal/onboarding/activate/route.ts` (mirror the repo's real `requireManagement` gate shape, as in Task 7):

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireManagement } from '@/lib/auth/requireManagement';
import { getActivationReadiness } from '@/lib/onboarding/activation';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { activationEmail } from '@/lib/email/templates';

export async function POST(request: Request) {
  const body = (await request.json()) as { requestedBy?: string; userId?: string };
  const { requestedBy, userId } = body;
  if (!requestedBy || !userId) {
    return NextResponse.json({ error: 'requestedBy and userId are required' }, { status: 400 });
  }
  const gate = await requireManagement(requestedBy);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const readiness = await getActivationReadiness(userId);
  if (!readiness.ready) {
    return NextResponse.json({ error: 'not ready', missing: readiness.missing }, { status: 409 });
  }

  const userRef = adminDb.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  if (userSnap.get('status') === 'active') return NextResponse.json({ ok: true, alreadyActive: true });

  await userRef.update({
    status: 'active',
    hireDate: new Date(),
    atRisk: FieldValue.delete(),
    updatedAt: new Date(),
  });
  await resolveAlertTasks(userId);
  const name = (userSnap.get('displayName') as string) ?? 'Rep';
  await dispatchToUser({
    userId,
    type: 'rep_activated',
    title: 'Welcome aboard - you are active',
    message: 'Your onboarding is complete.',
    link: '/portal',
    email: activationEmail({ name }),
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Change convert semantics + wire readiness flags**

In `src/app/api/portal/recruiting/convert/route.ts`, `approved` branch: remove `status: 'active'` and `hireDate` from the `users/{convertedUserId}` write (keep the invite/candidateOnboarding/application updates). Add after the writes:

```ts
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';

await dispatchToUser({
  userId: invite.convertedUserId,
  type: 'onboarding_approved',
  title: 'Application approved',
  message: 'Your application was approved. Finish your remaining onboarding steps to go active.',
  link: '/portal/onboarding',
});
void maybeFlagActivationReady(invite.convertedUserId).catch(() => {});
```

In `src/app/api/portal/onboarding/review/route.ts` POST, after a successful `approved` update: `void maybeFlagActivationReady(userId).catch(() => {});`. Also on `rejected`, send the rep an email via `dispatchToUser` with `itemRejectedEmail` (replacing/augmenting the existing in-app-only notification — keep the notification type `onboarding_rejected`).

In `src/app/api/webhooks/esign/route.ts`, after the item is marked approved: `await maybeFlagActivationReady(userId);`.

- [ ] **Step 7: Gates and commit**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` → clean.

```bash
git add src/lib/onboarding/activation.ts src/lib/onboarding/activation.test.ts src/app/api/portal/onboarding src/app/api/portal/recruiting/convert src/app/api/webhooks
git commit -m "feat(onboarding): manager activation gate; convert no longer auto-activates"
```

---

### Task 11: Stall-detection cron (Vercel Cron)

**Files:**
- Create: `vercel.json` (repo has none)
- Create: `src/lib/onboarding/stallDetection.ts`
- Create: `src/app/api/cron/onboarding-nudges/route.ts`
- Modify: `firestore.rules` (lock `onboardingNudges`)
- Test: `src/lib/onboarding/stallDetection.test.ts`

**Interfaces:**
- Consumes: `dispatchToUser` (Task 6), `nudgeEmail`/`appBaseUrl` (Task 5), `createAlertTask`/`renagStaleTasks` (Task 7), `getActivationReadiness` (Task 10), env `CRON_SECRET`.
- Produces: `dueNudges(lastActivityAt: Date, now: Date, alreadySent: NudgeTier[]): NudgeTier[]` (pure; `NudgeTier` re-exported from Task 5's templates), `runOnboardingNudges(now: Date): Promise<{ nudged: number; flaggedAtRisk: number }>`; new collection `onboardingNudges/{uid}` `{ sent: NudgeTier[], updatedAt }`; `users/{uid}.atRisk?: boolean`.

- [ ] **Step 1: Write the failing test**

`src/lib/onboarding/stallDetection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dueNudges } from './stallDetection';

const HOUR = 3600 * 1000;
const now = new Date('2026-07-08T12:00:00Z');
const idleFor = (h: number) => new Date(now.getTime() - h * HOUR);

describe('dueNudges', () => {
  it('nothing due under 24h idle', () => {
    expect(dueNudges(idleFor(23), now, [])).toEqual([]);
  });

  it('h24 due after a day idle', () => {
    expect(dueNudges(idleFor(25), now, [])).toEqual(['h24']);
  });

  it('does not resend an already-sent tier', () => {
    expect(dueNudges(idleFor(25), now, ['h24'])).toEqual([]);
  });

  it('returns all overdue unsent tiers after a week', () => {
    expect(dueNudges(idleFor(7 * 24 + 1), now, ['h24'])).toEqual(['h72', 'd7']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/onboarding/stallDetection.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/onboarding/stallDetection.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { nudgeEmail, appBaseUrl, type NudgeTier } from '@/lib/email/templates';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { getActivationReadiness } from './activation';

export type { NudgeTier };

const TIER_MS: Record<NudgeTier, number> = {
  h24: 24 * 3600 * 1000,
  h72: 72 * 3600 * 1000,
  d7: 7 * 24 * 3600 * 1000,
};
const TIER_ORDER: NudgeTier[] = ['h24', 'h72', 'd7'];

/** Pure: which nudge tiers are overdue and not yet sent. */
export function dueNudges(lastActivityAt: Date, now: Date, alreadySent: NudgeTier[]): NudgeTier[] {
  const idle = now.getTime() - lastActivityAt.getTime();
  return TIER_ORDER.filter((t) => idle >= TIER_MS[t] && !alreadySent.includes(t));
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const v = value as { toDate?: () => Date };
  return typeof v.toDate === 'function' ? v.toDate() : (value as Date);
}

export async function runOnboardingNudges(
  now: Date
): Promise<{ nudged: number; flaggedAtRisk: number }> {
  const pending = await adminDb.collection('users').where('status', '==', 'pending').get();
  let nudged = 0;
  let flaggedAtRisk = 0;

  for (const userDoc of pending.docs) {
    const uid = userDoc.id;
    if (!userDoc.get('fieldRole')) continue; // unassigned pool: covered by pending_assignment alerts

    // Idle if their newest userOnboarding update (or account creation) is old.
    const itemsSnap = await adminDb.collection('userOnboarding').where('userId', '==', uid).get();
    let lastActivity = toDate(userDoc.get('createdAt')) ?? now;
    itemsSnap.forEach((d) => {
      const u = toDate(d.get('updatedAt'));
      if (u && u > lastActivity) lastActivity = u;
    });

    // Waiting on a manager, not the rep? Skip nudges (activation_ready alert covers it).
    const { ready } = await getActivationReadiness(uid);
    if (ready) continue;

    const nudgeRef = adminDb.doc(`onboardingNudges/${uid}`);
    const nudgeSnap = await nudgeRef.get();
    const sent = ((nudgeSnap.get('sent') as NudgeTier[] | undefined) ?? []);
    const due = dueNudges(lastActivity, now, sent);
    if (due.length === 0) continue;

    const name = (userDoc.get('displayName') as string) ?? 'there';
    const portalUrl = `${appBaseUrl()}/portal/onboarding`;
    for (const tier of due) {
      await dispatchToUser({
        userId: uid,
        type: 'onboarding_nudge',
        title:
          tier === 'h24'
            ? 'Your onboarding is waiting'
            : tier === 'h72'
              ? 'Onboarding reminder'
              : 'Final onboarding reminder',
        message: 'Pick up where you left off - a few steps remain.',
        link: '/portal/onboarding',
        email: nudgeEmail({ name, tier, portalUrl }),
      });
      if (tier === 'h72') {
        await createAlertTask({
          kind: 'stalled_rep',
          subjectUserId: uid,
          subjectName: name,
          title: `${name} has stalled in onboarding`,
          message: 'No progress for 72 hours. Reach out and unblock them.',
          link: '/portal/admin/onboarding',
        });
      }
      if (tier === 'd7') {
        await userDoc.ref.update({ atRisk: true, updatedAt: new Date() });
        flaggedAtRisk += 1;
      }
      nudged += 1;
    }
    await nudgeRef.set({ sent: [...sent, ...due], updatedAt: now }, { merge: true });
  }
  return { nudged, flaggedAtRisk };
}
```

Note: nudge history resets are intentional-by-omission — once a rep makes progress (`updatedAt` moves forward), earlier tiers stay in `sent` and simply never re-fire; if the rep stalls again the remaining tiers still measure from the NEW lastActivity, which can under-nudge. Acceptable for v1; do not build re-arming logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/onboarding/stallDetection.test.ts` → PASS.

- [ ] **Step 5: Cron route + vercel.json**

`src/app/api/cron/onboarding-nudges/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { runOnboardingNudges } from '@/lib/onboarding/stallDetection';
import { renagStaleTasks } from '@/lib/alerts/alertTasks';

export const maxDuration = 300;

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = new Date();
  const nudges = await runOnboardingNudges(now);
  const renagged = await renagStaleTasks(now);
  return NextResponse.json({ ...nudges, renagged });
}
```

`vercel.json` (new file at repo root):

```json
{
  "crons": [
    {
      "path": "/api/cron/onboarding-nudges",
      "schedule": "0 * * * *"
    }
  ]
}
```

(Hourly. Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` when the `CRON_SECRET` env var is set on the project — set it in Vercel project settings.)

- [ ] **Step 6: Firestore rules**

Add to `firestore.rules`:

```
match /onboardingNudges/{uid} {
  allow read, write: if false;
}
```

- [ ] **Step 7: Gates and commit**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` → clean.

```bash
git add vercel.json src/lib/onboarding/stallDetection.ts src/lib/onboarding/stallDetection.test.ts src/app/api/cron firestore.rules
git commit -m "feat(cron): hourly stall-detection nudges (24h/72h/7d) and alert re-nag"
```

---

### Task 12: Self-registration funnel hookup (REVISED 2026-07-08)

> Original task assumed no self-signup existed. WRONG: self-signup shipped 2026-07-06
> (spec: `docs/superpowers/specs/2026-07-06-portal-self-signup-approval-design.md`).
> It is client-SDK based: `AuthContext.signUp()` (`src/contexts/AuthContext.tsx` ~191-226)
> does `createUserWithEmailAndPassword` + `setDoc(users/{uid}, { email, status:'pending', createdAt })`.
> `POST /api/portal/auth/signup` is INTENTIONALLY disabled per that spec — leave it alone.
> Admins already see pending signups in realtime (`src/hooks/admin/usePendingSignupsCount.ts`
> onSnapshot badge/banner). Approval = admin Users page `handleApprove`
> (`src/app/portal/admin/users/page.tsx` ~82-94) → `PUT /api/portal/auth/users/[id]`
> with `{ status:'active', fieldRole:'entry_rep' }` — status and fieldRole can arrive in
> the SAME call, or fieldRole can be set separately later via `UserForm.tsx`.

**Files:**
- Create: `src/app/api/portal/auth/signup-notify/route.ts`
- Modify: `src/contexts/AuthContext.tsx` (fire-and-forget notify after successful signup)
- Modify: `src/app/api/portal/auth/users/[id]/route.ts` (fieldRole-transition detection kicks off the funnel)
- Modify: `src/app/portal/admin/users/page.tsx` (`handleApprove` currently hardcodes `fieldRole:'entry_rep'` — it must let the admin pick the role; see Step 3)
- Test: covered by route-level behavior; funnel-kickoff logic reuses tested helpers

**Interfaces:**
- Consumes: `createAlertTask`/`resolveAlertTasks` (Task 7), `sendPendingEsignDocs` (Task 9), `dispatchToUser` (Task 6), `adminDb`.
- Produces: `POST /api/portal/auth/signup-notify` body `{ uid }` → broadcasts a `pending_assignment` alertTask (idempotent via createAlertTask dedupe). The PUT users route detects a fieldRole transition (none → set) on a user and starts the checklist funnel.

- [ ] **Step 1: Signup-notify endpoint**

The signup write is client-side, so the alert engine (server-only) needs a small hook. Create `src/app/api/portal/auth/signup-notify/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { createAlertTask } from '@/lib/alerts/alertTasks';

export async function POST(request: Request) {
  const { uid } = (await request.json()) as { uid?: string };
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  // Only ever notifies about a real, still-pending, role-less user doc —
  // safe to leave unauthenticated-but-validated (the caller just signed up
  // and has no session yet that portal API gates recognize).
  const snap = await adminDb.doc(`users/${uid}`).get();
  if (!snap.exists || snap.get('status') !== 'pending' || snap.get('fieldRole')) {
    return NextResponse.json({ ok: true });
  }
  const name = (snap.get('displayName') as string) ?? (snap.get('email') as string) ?? uid;
  await createAlertTask({
    kind: 'pending_assignment',
    subjectUserId: uid,
    subjectName: name,
    title: `${name} self-registered and needs a position`,
    message: 'Assign their role to start onboarding.',
    link: '/portal/admin/users',
  });
  return NextResponse.json({ ok: true });
}
```

(createAlertTask's dedupe makes repeat calls harmless.)

- [ ] **Step 2: Call it after signup**

In `src/contexts/AuthContext.tsx` `signUp()`, after the `setDoc` succeeds, add fire-and-forget:

```ts
void fetch('/api/portal/auth/signup-notify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: cred.user.uid }),
}).catch(() => {});
```

(Use the actual credential variable name in that function. Must not block or fail signup.)

- [ ] **Step 3: Role assignment kicks off the funnel**

In `src/app/api/portal/auth/users/[id]/route.ts` PUT: the handler already fetches the existing doc before writing (~lines 142-167). Detect the kickoff condition — incoming `fieldRole` is set AND the previous doc had NO `fieldRole`. (Do not require `status === 'pending'` in the guard: the approve path sets `status:'active'` and `fieldRole` in the same call, and design decision 6 still wants the checklist funnel for them. Note the promotion warning from Task 3 already covers light-vetting roles here.) When true, after the update succeeds:

Also in `src/app/portal/admin/users/page.tsx` `handleApprove`: replace the hardcoded `fieldRole: 'entry_rep'` with a role picker (small select in the approve confirmation using `RoleDisplayNames` field-role entries, defaulting to `entry_rep`) so decision 1 ("manager assigns the position") is honored. Additionally, per decision 6, the approve flow should set `status` to remain `'pending'` until onboarding completes — change `handleApprove` to send only `{ fieldRole }` (keep status pending; activation now happens via Task 10's activate route when the checklist is green).

```ts
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { nudgeEmail, appBaseUrl } from '@/lib/email/templates';

await resolveAlertTasks(id, ['pending_assignment']);
await dispatchToUser({
  userId: id,
  type: 'system',
  title: 'Your onboarding checklist is ready',
  message: 'Your position was assigned. Complete your checklist to go active.',
  link: '/portal/onboarding',
  email: nudgeEmail({ name: updatedDisplayName, tier: 'h24', portalUrl: `${appBaseUrl()}/portal/onboarding` }),
});
void sendPendingEsignDocs(id).catch((err) => console.error('[users] esign kickoff failed', err));
```

(If reusing the h24 nudge template reads oddly here, add a small `checklistReadyEmail(p: { name: string; portalUrl: string }): EmailContent` to `src/lib/email/templates.ts` with subject "Your onboarding checklist is ready" and the same layout — preferred.)

- [ ] **Step 4: Gates and commit**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` → clean. Manually verify with `npm run dev`: sign up at `/portal/signup`, confirm the pending_assignment alert fires, approve with a role from the admin users page, confirm the checklist-ready notification + e-sign kickoff.

```bash
git add src/app/api/portal/auth/signup-notify src/contexts/AuthContext.tsx src/app/api/portal/auth/users src/app/portal/admin/users src/lib/email/templates.ts
git commit -m "feat(auth): wire self-signup into alert engine; role assignment kicks off onboarding funnel"
```

---

### Task 13: Admin action queue — claim + activate UX

**Files:**
- Create: `src/components/admin/ActionQueue.tsx`
- Modify: `src/app/portal/admin/onboarding/page.tsx` (mount the queue above the review list)
- Test: none new (presentational; the claim/activate endpoints are already covered) — verify manually in Step 3

**Interfaces:**
- Consumes: `GET /api/portal/alerts`, `POST /api/portal/alerts/claim` (Task 7), `POST /api/portal/onboarding/activate` (Task 10), `useAuth()` from `@/contexts/AuthContext`, UI primitives from `src/components/ui/*`.
- Produces: `<ActionQueue />` (no props; reads the current user from `useAuth`).

- [ ] **Step 1: Implement `src/components/admin/ActionQueue.tsx`**

Match the card/button/badge components and fetch conventions used in `src/app/portal/admin/onboarding/page.tsx` (read it first; reuse its fetch helper pattern and styling classes). Structure:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AlertTaskRow {
  id: string;
  kind: 'review_needed' | 'stalled_rep' | 'pending_assignment' | 'activation_ready';
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
  status: 'open' | 'claimed';
  claimedBy?: string;
  claimedByName?: string;
  createdAt: string | null;
}

export default function ActionQueue() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AlertTaskRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/portal/alerts?requestedBy=${user.uid}`);
    if (res.ok) setTasks((await res.json()).tasks);
  }, [user]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  async function claim(taskId: string) {
    if (!user) return;
    setBusy(taskId);
    await fetch('/api/portal/alerts/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, taskId }),
    });
    setBusy(null);
    void load();
  }

  async function activate(task: AlertTaskRow) {
    if (!user) return;
    setBusy(task.id);
    const res = await fetch('/api/portal/onboarding/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, userId: task.subjectUserId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Cannot activate yet: ${(data.missing ?? []).join(', ') || data.error}`);
    }
    setBusy(null);
    void load();
  }

  if (tasks.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2">Needs attention ({tasks.length})</h2>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-sm text-muted-foreground">{task.message}</p>
              {task.status === 'claimed' && (
                <p className="text-xs text-muted-foreground mt-1">Claimed by {task.claimedByName}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {task.status === 'open' && (
                <button
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={busy === task.id}
                  onClick={() => void claim(task.id)}
                >
                  I&apos;ve got it
                </button>
              )}
              {task.kind === 'activation_ready' && (
                <button
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
                  disabled={busy === task.id}
                  onClick={() => void activate(task)}
                >
                  Activate
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Swap the raw `<button>`/utility classes for the page's actual `Button`/`Card` primitives from `src/components/ui/*` — copy exactly what the review page uses. Replace `alert(...)` with the page's toast/error pattern if one exists.

- [ ] **Step 2: Mount it, and surface the at-risk flag**

In `src/app/portal/admin/onboarding/page.tsx`, render `<ActionQueue />` between the page header and the review list.

Design decision 9 requires the 7-day "at risk" flag to be visible on the dashboard: the review API (`GET /api/portal/onboarding/review`) already joins user display info per row — extend that join to include `atRisk: !!userDoc.get('atRisk')` in each submission row, and in the review page render a small destructive-styled "At risk" badge next to the user's name when true.

- [ ] **Step 3: Verify manually**

Run `npm run dev`. Seed an alertTask (temporarily via a claimed flow or a one-off script through the Admin SDK), load `/portal/admin/onboarding` as an admin: task appears, claim marks it claimed for other viewers, an `activation_ready` task shows an Activate button that 409s (with missing items) for a non-ready user.

- [ ] **Step 4: Gates and commit**

Run: `npx tsc --noEmit`, `npm run build` → clean.

```bash
git add src/components/admin/ActionQueue.tsx src/app/portal/admin/onboarding/page.tsx
git commit -m "feat(admin): action queue with claim and one-click activation"
```

---

### Task 14: Onboarding wizard UI redesign

**Files:**
- Create: `src/components/onboarding/OnboardingWizard.tsx`
- Modify: `src/app/portal/onboarding/page.tsx` (swap the flat checklist for the wizard; keep all data fetching/submission logic)
- Test: none new (presentational refactor over already-tested endpoints); verify manually

**Interfaces:**
- Consumes: the page's existing `ChecklistItem` shape (`OnboardingItem & { status, reference, rejectionReason, reviewerName, submittedAt, reviewedAt }`), `FileUpload` (`src/components/onboarding/FileUpload.tsx`, props documented in its file), `isEsignItem`/`ESIGN_HELPER_TEXT` from `@/lib/onboarding/esign`.
- Produces: `<OnboardingWizard items={ChecklistItem[]} progress={{approved,total,complete}} renderItemAction={(item) => ReactNode} />` — the page passes its existing per-item upload/reference/e-sign controls through `renderItemAction`, so the wizard owns layout/navigation only, zero data logic.

- [ ] **Step 1: Read the current page**

Read `src/app/portal/onboarding/page.tsx` fully before touching it. Inventory: the fetch of `ChecklistResponse`, the per-item rendering branches (storage → `FileUpload`, esign → helper text, manual/vendor → reference input), and the submit handler. ALL of that logic survives unchanged — it moves into the `renderItemAction` callback.

- [ ] **Step 2: Implement `src/components/onboarding/OnboardingWizard.tsx`**

Design intent (design decision 10 — "proper UI redesign"): a focused stepper instead of a flat list. Requirements:

- Sticky progress header: `{approved}/{total} complete` with a filled progress bar, and a "You're all set - a manager will activate your account" state when `progress.complete`.
- Vertical step rail (desktop) / horizontal scroll chips (mobile): one entry per item, ordered by `item.order`, with a status icon: approved = filled check, submitted = clock ("In review" / for e-sign items "Awaiting signature"), rejected = warning triangle, not_started = hollow circle.
- One item expanded at a time (auto-select the first non-approved item on load; clicking a rail entry expands it). The expanded panel shows: label, category badge, status line, `rejectionReason` in a destructive-styled callout with the reviewer name when rejected, and `renderItemAction(item)` for anything actionable.
- E-sign items awaiting signature show `ESIGN_HELPER_TEXT` and no manual action.
- No blocking/locking: every step is reachable in any order (automation advances what it can; the wizard is guidance, not a gate).

Skeleton (adapt classnames to the repo's Tailwind v4 + `src/components/ui/*` conventions — read two existing portal pages first and match their card/badge/typography patterns):

```tsx
'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isEsignItem, ESIGN_HELPER_TEXT } from '@/lib/onboarding/esign';
import type { OnboardingItem, OnboardingStatus } from '@/types/onboarding';

export interface WizardItem extends OnboardingItem {
  status: OnboardingStatus;
  reference: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
}

interface Props {
  items: WizardItem[];
  progress: { approved: number; total: number; complete: boolean };
  renderItemAction: (item: WizardItem) => ReactNode;
}

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_started: 'To do',
  submitted: 'In review',
  approved: 'Done',
  rejected: 'Needs attention',
};

export default function OnboardingWizard({ items, progress, renderItemAction }: Props) {
  const ordered = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const firstOpen = ordered.find((i) => i.status !== 'approved')?.id ?? ordered[0]?.id;
  const [activeId, setActiveId] = useState<string | undefined>(firstOpen);
  useEffect(() => setActiveId(firstOpen), [firstOpen]);
  const active = ordered.find((i) => i.id === activeId);
  const pct = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="lg:sticky lg:top-4 self-start">
        <div className="rounded-lg border bg-card p-4 mb-4">
          <p className="text-sm font-medium">{progress.approved} of {progress.total} complete</p>
          <div className="mt-2 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {progress.complete && (
            <p className="mt-3 text-sm text-muted-foreground">
              You&apos;re all set - a manager will activate your account.
            </p>
          )}
        </div>
        <ol className="flex lg:flex-col gap-1 overflow-x-auto">
          {ordered.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveId(item.id)}
                aria-current={item.id === activeId ? 'step' : undefined}
                className={`w-full text-left rounded-md px-3 py-2 text-sm flex items-center gap-2 ${
                  item.id === activeId ? 'bg-accent font-medium' : 'hover:bg-accent/50'
                }`}
              >
                <StatusIcon status={item.status} esign={isEsignItem(item.id)} />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border bg-card p-6 min-h-64">
        {active && (
          <>
            <div className="flex items-center justify-between gap-4 mb-1">
              <h2 className="text-xl font-semibold">{active.label}</h2>
              <span className="text-xs rounded-full border px-2 py-0.5">{active.category}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {active.status === 'submitted' && isEsignItem(active.id)
                ? 'Awaiting signature'
                : STATUS_LABEL[active.status]}
            </p>
            {active.status === 'rejected' && active.rejectionReason && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-medium">Returned{active.reviewerName ? ` by ${active.reviewerName}` : ''}:</p>
                <p>{active.rejectionReason}</p>
              </div>
            )}
            {isEsignItem(active.id) && active.status !== 'approved' ? (
              <p className="text-sm text-muted-foreground">{ESIGN_HELPER_TEXT}</p>
            ) : (
              renderItemAction(active)
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status, esign }: { status: OnboardingStatus; esign: boolean }) {
  // Use the repo's icon set (check the imports in PortalSidebar.tsx, likely lucide-react):
  // approved -> CheckCircle2 (text-primary), submitted -> Clock (text-muted-foreground),
  // rejected -> AlertTriangle (text-destructive), not_started -> Circle (text-muted-foreground/50).
  // esign+submitted may reuse Clock; the label already says "Awaiting signature".
  ...
}
```

Implement `StatusIcon` fully with the icon library actually present in `package.json` (grep for `lucide-react`); the four-branch mapping in the comment is the spec.

- [ ] **Step 3: Refactor the page**

In `src/app/portal/onboarding/page.tsx`: keep every hook, fetch, and handler; replace the flat item-list JSX with:

```tsx
<OnboardingWizard
  items={checklist.items}
  progress={checklist.progress}
  renderItemAction={(item) => (
    /* the existing per-item branch: FileUpload for storage items,
       reference input + submit button for manual/vendor items,
       nothing for esign (wizard handles that) */
  )}
/>
```

- [ ] **Step 4: Verify manually**

`npm run dev`, log in as a pending rep (or temporarily view with a seeded user): rail shows all applicable items with correct icons; first incomplete item auto-expands; uploads still submit; rejected item shows the reason callout; mobile viewport (~375px) shows the horizontal chip rail without layout breakage.

- [ ] **Step 5: Gates and commit**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` → clean.

```bash
git add src/components/onboarding/OnboardingWizard.tsx src/app/portal/onboarding/page.tsx
git commit -m "feat(onboarding): stepper wizard redesign for the rep checklist"
```

---

## Final Verification

- [ ] `npm test` — full suite green.
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `npm run build` — clean production build.
- [ ] `npm run lint` — no new violations.
- [ ] End-to-end smoke (`npm run dev` + two browsers, manager and rep):
  1. Manager creates an invite → candidate receives the invite email (or grab `inviteUrl` from the response on the free Postmark tier).
  2. Candidate completes `/onboard/[token]` as `entry_rep` → e-sign envelopes auto-send (SignWell test mode), manager gets the submission alert.
  3. Sign a document in SignWell test mode → webhook flips the item to approved without human action.
  4. Manager approves remaining uploads; admin approves `background_check` → `activation_ready` alert appears in the action queue.
  5. Manager claims, clicks Activate → rep gets email+push+bell, `users/{uid}.status` = `active`.
  6. Self-registration: `/register` → pending_assignment alert → assign role → checklist-ready dispatch + envelopes send.
  7. Invite a `general_manager` → no SSN/DL/screen steps appear; assigning `office_manager` to a fresh user surfaces the promotion warning.
  8. Hit the cron route locally with `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/onboarding-nudges` against a user with backdated timestamps → nudges fire once per tier.

## Manual / Ops checklist (not code — do alongside deploy)

- [ ] `firebase deploy --only firestore:rules` after Tasks 1, 7, 11 land (or once at the end).
- [ ] Create composite Firestore indexes when first-run errors provide the links (alertTasks queries).
- [ ] Postmark: create server, verify sender domain/address, set `POSTMARK_SERVER_TOKEN` + `EMAIL_FROM` in Vercel + `.env.local`. Free tier: 100 emails/mo, own-domain recipients until approved.
- [ ] SignWell: create account, build the 4 templates (Contract, Direct Deposit, Compensation, FCRA Authorization) with a single `signer` placeholder each, set `SIGNWELL_API_KEY` + 4 template env vars + `SIGNWELL_TEST_MODE=true` (flip to `false` at go-live), register webhook `https://<domain>/api/webhooks/esign`.
- [ ] Vercel: set `CRON_SECRET`, `APP_BASE_URL`, `ESIGN_PROVIDER=signwell`; confirm the cron appears under Project → Settings → Cron Jobs after deploying `vercel.json`.
- [ ] FCM: confirm `public/firebase-messaging-sw.js` still registers and `PushNotificationsCard` token registration works (infra exists; this project only adds senders).

## Deferred / open items

- **Adobe Sign**: if the account tier turns out to include API access, implement `src/lib/esign/adobesign.ts` against the same `EsignProvider` interface and flip `ESIGN_PROVIDER=adobe_sign`. Nothing else changes — that is the point of the interface.
- **Admin form-builder**: explicitly out of scope (design decision 10).
- **`managerId`/`User`-type field drift** (invite-submit writes `managerId`, the type doesn't declare it): pre-existing; reconcile opportunistically if a task touches that write, otherwise leave.
- **Route auth hardening**: most routes trust client-supplied uids (`requireManagement` pattern). This plan matches the existing pattern for consistency; migrating to `requireVerified*` everywhere is a worthwhile follow-up project.
