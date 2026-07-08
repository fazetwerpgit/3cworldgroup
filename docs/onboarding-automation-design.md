# Onboarding Automation — Design Decisions

Status: agreed 2026-07-08 (grilling session with Jacob). Not yet implemented.
Source requirements: Jeremy McFarland's role/requirements email (2026-06-22).

## Problem
Reps drop off during onboarding due to email back-and-forth and humans
forgetting to advance them. The portal takes over the entire funnel:
automation advances every step it can; humans are aggressively notified
for the few steps that need them.

## Decisions

1. **Entry — two doors, manager assigns role.** A manager invites a rep with
   the role pre-set (checklist starts immediately), or the rep self-registers
   into the existing pending pool; managers are notified, assign the position,
   and that kicks off the checklist. No sensitive collection before a manager
   has assigned a role.
2. **Roles.** Add `general_manager`, `gm_in_training`, `office_manager` as new
   field roles in `src/types/auth.ts` (plus sidebar gating / rules updates).
   "IBO Rep" = rep linked to an IBO owner via existing `iboOwnerId`; IBO-only
   checklist items (SoS doc, insurance, chargeback card) stay on the owner.
3. **GM / GM-in-training / Office Manager get lighter vetting** (no background
   screen, SSN, DL#, DL photos) — intentional, these are internal promotions.
   Portal must warn when one of these roles is assigned to a user who never
   completed base onboarding.
4. **E-sign — fully automated** behind a provider-agnostic `EsignProvider`
   interface (create envelope from template, prefill, signing URL, completion
   webhook). First implementation: Adobe Sign IF the account tier has API
   access (Jacob checking); otherwise SignWell or Dropbox Sign.
   Docs auto-send when the rep reaches the step; webhook marks it complete.
5. **Background/drug screen = signed FCRA authorization only** (a 4th e-sign
   document alongside Contract / Direct Deposit / Compensation). The actual
   screen runs outside the portal; an admin records pass/fail, which gates
   final activation.
6. **Approval gates:** e-sign steps auto-complete via webhook (no review);
   uploads (DL photos, W-9, SoS, insurance) get one-click approve/reject in
   the review queue; final "rep is active" requires everything green AND a
   manager approval click. Two human touchpoints total.
7. **Alert channels:** in-app (existing bell) + email (new — default Resend,
   pending sign-off) + push (activate the dormant FCM `sendPushToUser`).
8. **Alert routing — broadcast + claim.** All managers/admins get every
   actionable alert; one-tap "I've got it" claim; follow-ups go only to the
   claimer; unclaimed alerts re-nag the whole group after 24h.
9. **Rep stall nudges (Vercel Cron):** idle 24h → friendly email+push;
   72h → second nudge + manager-group alert; 7d → final email + "at risk"
   flag on the dashboard.
10. **Scope v1:** checklists stay code-defined in `ONBOARDING_ITEMS`
    (`src/types/onboarding.ts`); the onboarding wizard gets a proper UI
    redesign; an admin form-builder is explicitly deferred to a future
    project.

## Already exists (extend, don't rebuild)
- Checklist model with role filtering + IBO-only items: `src/types/onboarding.ts`
- Invite flow with hashed tokens: `/onboard/[token]`, `onboardingInvites`,
  `src/app/api/portal/recruiting/*`
- Rep onboarding page `/portal/onboarding`; admin review page
  `/portal/admin/onboarding`; onboarding review API
- Upload pipeline via Admin SDK under `onboarding/{uid}/{itemId}/`
- Encrypted SSN/DL# with last-4 display and admin-only reveal:
  `src/lib/security/fieldEncryption.ts`, `src/lib/onboarding/sensitiveFields.ts`,
  `/api/portal/admin/sensitive/[uid]`
- In-app notifications (Firestore + 30s polling + header bell)
- Dormant FCM push infra: `src/lib/push/sendPush.ts`, service worker, token registry

## Net-new build
- `EsignProvider` interface + first provider implementation + webhook route
- Email sending (Resend) + transactional templates
- Activate FCM push sending
- Claim/nag alert engine (broadcast, claim, 24h re-nag)
- Stall-detection cron (Vercel Cron hitting an API route)
- Three new field roles + promotion-path warning
- Onboarding wizard UI redesign
- Manager approval + claim UX on dashboard/review queue

## Open items (resolve before build)
- [ ] Adobe Sign plan: does it include API access? No API key yet (2026-07-08);
      API access requires their enterprise tier. Fallback: SignWell or
      Dropbox Sign behind the same `EsignProvider` interface.
- [x] Email provider: Postmark (decided 2026-07-08). Starting on the free
      developer tier (100 emails/mo) until the company card is available —
      upgrade to a paid plan before real rep volume, and note the free tier
      may restrict sending to your own domain's addresses until the account
      is approved for production sending.
- [x] W-9 stays required for new reps (confirmed by Jacob 2026-07-08;
      reps are 1099 contractors).
