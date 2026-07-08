## Status

DONE

## Commits

- `b136163` - `feat(roles): add general_manager, gm_in_training, office_manager field roles`

## Files changed

- `src/types/auth.ts`
- `src/types/auth.test.ts`
- `src/components/portal/PortalSidebar.tsx`
- `src/lib/auth/requireManagement.ts`
- `src/lib/auth/requireVerifiedAdmin.ts`
- `src/app/portal/pay-structure/page.tsx`
- `firestore.rules`
- `.superpowers/sdd/task-1-report.md`

## Test evidence

Command: `npm test -- src/types/auth.test.ts`

Initial expected failure before implementation:

```text
Test Files  1 failed (1)
Tests  3 failed (3)
```

Command: `npm test -- src/types/auth.test.ts`

Final result:

```text
Test Files  1 passed (1)
Tests  3 passed (3)
```

Command: `npx tsc --noEmit`

Final result:

```text
Exit code: 0
```

Command: `npm test`

Final result:

```text
Test Files  39 passed (39)
Tests  277 passed (277)
```

## Self-review notes

- Followed TDD sequence: created `src/types/auth.test.ts`, confirmed it failed, then implemented the role additions.
- Added `general_manager`, `gm_in_training`, and `office_manager` to `FieldRole`, `FieldRoles`, `RoleDisplayNames`, and `RolePermissions`.
- Added `LIGHT_VETTING_ROLES` and `MANAGEMENT_FIELD_ROLES`.
- Updated sidebar field-user and field-manager role lists. `gm_in_training` was added only to the field-user onboarding list, not to management-gated lists.
- Replaced duplicated field-manager predicates in `requireManagement.ts` and `requireVerifiedAdmin.ts` with `MANAGEMENT_FIELD_ROLES` while preserving admin/operations checks.
- Updated `firestore.rules` only; no deploy was performed. Manual `firebase deploy --only firestore:rules` is required.
- Added pay-structure notes and icons for the three new field roles after `src/app/portal/pay-structure/page.tsx` was added to the allowed touch list.

## Concerns

- None.
