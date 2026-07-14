# Recruiting Command Center — ops-line addendum (BINDING)

Authorization: user request 2026-07-14 ("looks like we missed the recruiting
command center for the redesign"). This addendum extends the ops-line contract
(docs/redesign/ops-the-line-goal.md) to /portal/admin/recruiting, which that
contract explicitly deferred. The approved one-queue-design rule covers this
page; NO new mockup round. Orchestrator: main session, 2026-07-14.

Source of truth for page anatomy: the read-only extraction report at
(scratchpad)/recruiting-extract-report.txt — builder MUST read it first.

## Scope

- Recompose `src/app/portal/admin/recruiting/page.tsx` on the ops-line design
  system (same language as the 6 shipped queues + Ops home: hero with kicker /
  display numeral, panels, eyebrows, quiet rail, state pills, lucide icons).
- CSS: do NOT edit the frozen ops-line block. Append a new clearly-marked
  section at the END of globals.css:
  `/* Ops-line addendum — recruiting command center (form + two-action queue) */`
  using `ops-line-` prefixed classes only. Additions-only diff on globals.css.
- The create-invite form region has no existing ops-line analog — invent
  `ops-line-form-*` field/input/select styling consistent with the system
  (explicit font-weight on headings, tokens from the ops-line palette, dark =
  1:1 target, light coherent, reduced-motion exemption pattern).
- Invite queue: two actions (Activate / Reject). Prefer a page-local list
  composed from ops-line classes. You MAY add optional, default-preserving
  props to OpsQueueList instead — only if no other caller's rendering changes.

## Behavior rulings (binding)

1. VISUAL-ONLY on data flows: createInvite / convertInvite request+response
   shapes, both API routes, token generation, and ownership filtering are
   UNTOUCHED. Both auth gates preserved exactly (ProtectedRoute roles list AND
   the hasPermission('recruiting:read') fetch gate).
2. Hero numeral = submitted-status invite count, matching the Ops home
   "Recruiting" card exactly (ops contract ruling #5). `.portal-metallic-num`,
   never clipped, verified 1440 + 390. Plain numbers, no leading zeros.
3. B-2 (Reject deactivates a real account, currently single-click): ADD the
   shipped confirm pattern (inline confirm strip, same as ops/admin rounds)
   before the reject request fires. This is the ONE sanctioned behavior
   change — it matches every other destructive action shipped this campaign.
   No reason field added.
4. B-3 (lost invite link, no resend): existing accepted gap. Do NOT add
   resend/regenerate. The one-time raw-token display + copy affordance must
   survive the recompose exactly (shown once, never re-fetchable).
5. B-4: split the conflated statusTone lookup into two typed maps
   (ApplicationStatus vs OnboardingInviteStatus). Do not port the mis-color
   bug forward.
6. B-5: keep the 'approved' invite-status label mapping even if no writer is
   found — harmless, not our call to delete.
7. B-8/B-9 (applications not ownership-filtered; 100-row invite query
   under-count): pre-existing backend behavior, OUT of scope, do not touch.
8. Honest empty states per campaign rule — never fabricate data.

## Gates

npx tsc --noEmit, npm run lint (changed files), npm run build, and a diff
check proving globals.css is additions-only and no file outside
{recruiting page, globals.css, optional OpsQueueList additive props} changed.
Then orchestrator browser verify (1440 + 390, dark + light, scrollWidth 375
at 390) and a fresh Opus adversarial review to PASS before commit.
