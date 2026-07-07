---
name: verify
description: How to build, run, and drive the 3C World Group portal to verify changes end-to-end
---

# Verifying changes in this repo

## Run
- `npm run dev` — Next.js 16 (Turbopack) on port 3000. A dev server is often ALREADY running on 3000 (check before starting; a second instance fails on the `.next/dev/lock`). Reuse the running one — it hot-reloads.
- Gates: `npx tsc --noEmit` then `npm run build`. `npm run lint` has pre-existing repo-wide debt (unescaped entities, prefer-const, set-state-in-effect) — lint only the touched files.

## Auth surfaces
- Login: `http://localhost:3000/portal` (email/password + "Continue with Google" popup). Signup: `/portal/signup`.
- Local dev talks to the PRODUCTION Firebase project `cworldgroup-cca68` — any user you create is real. Always clean up.
- Approval model: signup creates Firestore `users/{uid}` `{email, status:'pending', createdAt}`; admin flips status to `active`. Pending users see the "Account pending approval" screen and are signed out.
- Google SSO first sign-in is simulated by creating an auth-only user (Admin SDK, no Firestore doc) and signing in with email/password — it exercises the same missing-profile bootstrap in `src/contexts/AuthContext.tsx`.

## Admin SDK scripting
- Credentials come from `.env.local` (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` — strip quotes, replace `\n`). Require `firebase-admin` / `google-auth-library` from the repo's `node_modules`.
- Backend auth config (providers, authorized domains) is readable via `GET https://identitytoolkit.googleapis.com/admin/v2/projects/cworldgroup-cca68/config` and `.../defaultSupportedIdpConfigs` with a cloud-platform-scoped token.
- Deployed Firestore rules: `https://firebaserules.googleapis.com/v1/projects/<pid>/releases` → fetch the `cloud.firestore` ruleset.

## Gotchas
- The login form remounts after an auth error and clears the email field — refill both fields when retrying in Playwright.
- Closing the Google popup tab surfaces the `auth/popup-closed-by-user` → "Sign-in was cancelled." path (useful probe).
