# 3C Portal iOS App — Build Spec (DRAFT, awaiting Jacob OK)

Status 2026-10-16. Source: read-only readiness audit of this repo.

## Shape
- Separate app from the Expo knocking app. Same Apple org account (3C World Group).
- Expo (SDK latest stable) + `react-native-webview` loading `https://www.3cworldgroup.com/portal/dashboard`.
- Builds and submits via EAS from Linux (no Mac).
- New repo (location TBD). Bundle id proposal: `com.3cworldgroup.portal`.
- Rollout: TestFlight (Jacob + Jeremy) -> unlisted App Store link for the team.

## Part A — Portal changes (this repo)

### A1. Shell detection
- The shell appends ` 3CPortalApp/<version>` to the WebView user-agent and injects `window.__3C_APP__ = true`.
- Add `src/lib/app/isNativeApp.ts`.
- In the app, hide these PWA nudges:
  - `AddToHomeScreenBanner` and `PushPromptBanner` (dashboard/page.tsx:469-470)
  - `InstallAppCard` and `PushNotificationsCard` (settings/page.tsx:349-350)
- Skip web-push registration in the app: `PushTokenRefresher` and `ServiceWorkerRegistrar` (portal/layout.tsx:33-35).

### A2. Native Google + Sign in with Apple (DECIDED 10/16: option B)
`signInWithPopup` (LoginForm.tsx:67) fails inside the WebView, and keeping Google forces Sign in with Apple (guideline 4.8). Plan:
- Web, in-app only: replace the popup Google button with "Continue with Google" and "Continue with Apple" buttons that post `{type:'nativeSignIn', provider}` to the shell.
- The shell runs native sign-in and posts back either `{provider:'google', idToken}` or `{provider:'apple', idToken, rawNonce}`. The web layer calls `signInWithCredential` with `GoogleAuthProvider.credential` or `OAuthProvider('apple.com').credential`. The web generates the nonce, sends only the hashed nonce to the shell, and keeps the raw nonce.
- New-user path reuses the existing Google first-time logic (AuthContext.tsx:154-163, pending users doc, admin approval). Apple may give a hidden relay email or no name, so the pending doc must tolerate that.
- Account linking (prevents duplicates):
  - On `auth/account-exists-with-different-credential`, prompt "Sign in with your existing method to link". After that sign-in, call `linkWithCredential`.
  - Settings gets "Linked sign-in methods" with link and unlink (Google, Apple, password), in-app only for Apple.
- Web (non-app) behavior is unchanged: Google popup stays and Apple is not shown.
- Needs an Apple provider in Firebase Auth (Services ID + key). Jacob creates those after the account is activated. Code can land first, behind the app flag.

### A3. Self-service account deletion (BLOCKER, 5.1.1(v))
- New route `DELETE /api/portal/auth/me`, verified with the user's ID token. The admin route blocks self-deletion at users/[id]/route.ts:381; the new route reuses that route's cleanup logic.
- Settings gets a "Delete account" button behind a typed confirmation.
- Decide what happens to sales and pay history. Proposal: disable the auth user and anonymize the profile, but keep sales records for payroll and carrier reconciliation. The privacy page states this.
- Owners and admins cannot self-delete the last owner account.

### A4. Native push
- `POST /api/portal/push/register` accepts `{ token, platform: 'ios-native' }`, stored in `users/{uid}.nativePushTokens[]`.
- `sendPushToUser` (lib/push/sendPush.ts:17) sends to web tokens as today (data-only). For native tokens it adds `notification` + `apns` (sound, badge, `data.url` for deep link) and prunes dead tokens the same way.
- `pushHealth` records native too.

### A5. Link and download handling (in-app)
- `window.open` / `_blank` / `tel:` / `mailto:` / Meet links are handled by the shell: same-host URLs stay in the WebView, others open in Safari or an in-app browser.
- CSV export (lib/export/csv.ts:23): in the app, POST the blob to the native bridge, which opens the share sheet.

## Part B — Expo shell app (new repo)
1. WebView with persistent data store, pull-to-refresh, offline/error screen, splash and icon matched to 3C brand.
2. Bridge (`postMessage`), messages: `pushToken`, `haptic`, `share`, `saveFile`, `openExternal`, `biometricLock`.
3. Push: `expo-notifications` + FCM (`@react-native-firebase/messaging` or Expo push → FCM). Permission prompt only after login, on a user tap. A tapped notification opens `data.url` in the WebView.
4. Face ID: `expo-local-authentication` locks the app when it resumes after more than N minutes. The Firebase web session stays as is.
5. Haptics on sale submit and other key actions (`expo-haptics`, triggered by bridge messages).
6. Share sheet (`expo-sharing`) for CSV and attachments.
7. Info.plist: camera, photo library and Face ID usage strings.
8. Universal links for `www.3cworldgroup.com/portal/*`, so links in emails open the app. This needs `apple-app-site-association` served from the portal.
9. `eas.json`: development, preview (TestFlight) and production profiles.

## Part C — App Store submission
- Reviewer demo account: a dedicated `rep` user with fake data. It never sees real financials and is deleted or disabled after review.
- Privacy policy URL `/privacy` (update it for in-app deletion and push). Privacy nutrition label: contact info, user ID, financial info (pay estimates), photos (screenshots).
- Screenshots (6.9" iPhone), icon, description.
- Review notes explain the internal sales-team app and the native features (push, Face ID, share) to address guideline 4.2.

## Gates
- Portal: `npx tsc --noEmit`, tests, `npm run build`, then a mobile web regression check (the app-only code paths must not change normal browser behavior).
- Shell: EAS preview build installed via TestFlight, tested on Jacob's iPhone. Jacob is the acceptance gate.

## Open decisions for Jacob
1. Google sign-in: DECIDED option B (native Google + Apple).
2. Deleted-account data: DECIDED anonymize + keep sales records.
3. Shell repo: DECIDED ~/dev/3c-portal-app.
4. Can Jacob create the app record and keys? That means enrolling the bundle id, setting up the APNs key in the Apple portal, and uploading it to Firebase. Claude can walk through it.
