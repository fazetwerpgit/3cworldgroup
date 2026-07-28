# Final whole-branch fix round — onboarding/completion

## Findings

- F1: The convert route now reads the converted user's status before the readiness gate. Already-active users proceed to invite/application bookkeeping; inactive or pending users retain the existing 409 readiness behavior.
- F2: `maybeFlagActivationReady` now delegates to `activateUser`. The shared writer graduates field roles, clears `atRisk` with `FieldValue.delete()`, writes `hireDate`/`updatedAt`, resolves alerts, and sends activation email. Role-aware notification titles are centralized in `activateUser`.
- F3: Review approval now schedules activation readiness through `after()` with the existing error logging.
- F4: Dispatch alerts are raised for every failure at attempt 3 or later. A recovered item only resolves the alert after a user-wide failed-item query confirms no failed dispatch remains.
- F5: Added a submitted-item readiness case, pinned activation writes and dispatch payloads, and asserted alert resolution.
- F6: Added unauthorized converter, non-owner converter, and end-to-end rejection coverage.
- F7: Added non-admin operations coverage for platform-role assignment, platform-role editing, and deletion.
- F8: Made public invite lookup match the hashed-token query value and added wrong-token, expired, already-submitted, and short-password cases.
- F9: Made review document doubles key on document ID and added successful non-e-sign approval coverage including activation scheduling.
- F10: Captured Firestore set options and asserted `{ merge: true }`; asserted the exact envelope signer identity and document fields.
- F11: Asserted sidebar, palette, and mobile navigation markup independently.
- F12: Keyed auth/chat Firestore doubles by collection and document ID, registered per-UID fixtures, and added a caller-vs-target self-or-management case.

## Bite-proofs

Each mutation was applied, the named boundary test failed, the mutation was reverted, and the focused test was green again.

- F5: Removed `if (!ready) return;` from `activation.ts` -> `does not activate or dispatch while an item is still submitted` failed -> reverted -> activation test green (21/21).
- F6: Removed the `canConvert` guard -> `rejects a caller who cannot convert recruits` failed -> reverted -> convert test green (6/6).
- F6: Removed the invite `ownerId` guard -> `rejects a valid field converter who does not own the invite` failed -> reverted -> convert test green (6/6).
- F7: Removed the platform-role assignment escalation guard -> `rejects an operations caller assigning a platform role` failed -> reverted -> users route test green (8/8).
- F8: Passed the raw token to `where()` instead of `hashInviteToken(token)` -> six valid/validation cases failed, including the accepted packet -> reverted -> public onboarding test green (7/7).
- F8: Removed the `snapshot.empty` guard -> `rejects a wrong invite token as not found` failed with 500 -> reverted -> public onboarding test green (7/7).
- F9: Widened the e-sign approval guard to all approvals -> `approves a non-e-sign item, writes the target item document, and checks activation` failed -> reverted -> review test green (6/6).
- F9: Changed `.doc(`${userId}_${itemId}`)` to `.doc(itemId)` -> the same successful-approval test failed on the document ID -> reverted -> review test green (6/6).
- F10: Removed `{ merge: true }` from the persistence write -> merge-option assertions failed -> reverted -> auto-send test green (17/17).
- F10: Swapped signer name and email values -> exact envelope signer assertion failed -> reverted -> auto-send test green (17/17).
- F11: Made `PortalSidebar.canAccess` reject every `onboardingOnly` item -> both hire onboarding visibility tests failed -> reverted -> PortalChrome test green (6/6).
- F12: Temporarily routed `requireVerifiedSelfOrManagement`'s shared caller lookup through the target ID (the equivalent of changing `doc(uid)` to `doc(targetUserId)`) -> caller-vs-target and related self/management tests failed -> reverted -> auth/chat tests green (48/48).

## Gates

- `npx tsc --noEmit`: PASS (exit 0; no output)
- `npm test`: PASS — 67 test files, 565 tests
- `npm run build`: PASS (exit 0; production compile and 114 static pages generated)
- `npx eslint` on every touched TypeScript/TSX file: PASS (exit 0; 0 errors, 0 warnings)

## Deviations

- No production scope deviations. Existing unrelated `docs/redesign/RESUME.md` changes and untracked root PNGs were not touched or staged.
- F12's requested mutation names a target ID in the helper, but this repository keeps the document read in shared `verifyCaller`, before `requireVerifiedSelfOrManagement` receives its target ID. The bite-proof used a temporary optional target override to exercise the exact impersonation behavior, then fully reverted it.
