# 3C Portal app bridge — contract v1

The contract between the portal (web, this repo) and the Expo shell
(`~/dev/3c-portal-app`, SPEC Part B). The web side is
`src/lib/app/bridge.ts`; its types are the source of truth. Keep this file and
that module in step, and bump `BRIDGE_VERSION` on any breaking change.

## Shell detection

The shell must do both:

1. Append ` 3CPortalApp/<version>` (leading space) to the WebView user agent
   (`applicationNameForUserAgent` / `userAgent` on `react-native-webview`).
2. Inject `window.__3C_APP__ = true;` before content loads
   (`injectedJavaScriptBeforeContentLoaded`).

Either marker turns on in-app behavior (`src/lib/app/isNativeApp.ts`). Without
them the portal behaves exactly as in a browser or the PWA.

## Transport

| Direction | How |
|---|---|
| web -> native | `window.ReactNativeWebView.postMessage(JSON.stringify(message))` -> the shell's `onMessage` (`event.nativeEvent.data`). |
| native -> web | Preferred: `webview.injectJavaScript("window.__3C_BRIDGE__ && window.__3C_BRIDGE__.receive(" + JSON.stringify(message) + "); true;")`. Also accepted: a DOM `message` event on `window` or `document` whose `data` is the message object or its JSON string. |

Every native -> web message must carry `source: "3c-shell"`. The web ignores
anything else. `window.__3C_BRIDGE__.version` is the contract version the page
speaks (currently `1`).

## Requests and replies

Requests carry a unique string `id`. The shell answers each one with exactly
one reply:

```json
{ "source": "3c-shell", "type": "reply", "id": "<same id>", "ok": true, "result": { } }
{ "source": "3c-shell", "type": "reply", "id": "<same id>", "ok": false, "error": "Human-readable text", "code": "canceled" }
```

Error `code` is one of: `canceled` (the person dismissed the sheet or
prompt), `denied` (the OS permission is off), `not_configured` (native setup
missing, e.g. Sign in with Apple keys), `unsupported` (this shell version does
not know the message type), `failed` (anything else). The shell should answer
an unknown request `type` with `ok: false, code: "unsupported"`.

The web stops waiting after a timeout (60 s for `pushToken` and
`biometricLock`, 5 min for `nativeSignIn`, 10 min for `share` and `saveFile`,
15 s for `nativeAuth`, 1.5 s for `openNativeChat`).
A late reply is ignored.

Messages without an `id` (`haptic`, `openExternal`, `nativeSignOut`) are
fire-and-forget: no reply.

## web -> native messages

These are the six messages from SPEC Part B, plus `nativeSignIn` from SPEC A2.

### `pushToken` (request)
```json
{ "type": "pushToken", "id": "w1", "prompt": false }
```
Return the device's FCM registration token (APNs-backed). `prompt: true` is
sent only from a user tap ("Turn on" in Settings). Only then may the shell show
the iOS permission question. With `prompt: false`, never prompt: return the
token if permission is already granted, or `token: null` if it is not.

Result: `{ "token": "<fcm token>" | null, "permission": "granted" | "denied" | "undetermined" }`

The web stores the token on the user with
`POST /api/portal/push/register { token, platform: "ios-native" }`.

### `haptic` (event)
```json
{ "type": "haptic", "style": "success" }
```
`style`: `light` | `medium` | `heavy` | `selection` | `success` | `warning` | `error`
(maps to `expo-haptics` impact / selection / notification).

The portal sends `success` when a sale is submitted or an edit is saved, and
when an account deletion finishes; it sends `error` when a sale submit or edit
save fails. Outside the app the call does nothing.

### `share` (request)
```json
{ "type": "share", "id": "w2", "url": "https://...", "text": "...", "title": "..." }
```
All fields optional. Opens the share sheet. Result: `{ "completed": boolean }`.

### `saveFile` (request)
```json
{ "type": "saveFile", "id": "w3", "filename": "recruits.csv", "mimeType": "text/csv", "base64": "<bytes>" }
```
Write the file to the cache directory under `filename` and open the share sheet
(`expo-sharing`) so the person can save or send it. `base64` has no `data:`
prefix. The portal sends every download this way inside the app: CSV exports,
the employee export, onboarding zips. Result: `{ "completed": boolean }`.

### `openExternal` (event)
```json
{ "type": "openExternal", "url": "https://meet.google.com/abc-defg-hij" }
```
Open outside the WebView. Use Safari or an in-app browser for `https`, and
`Linking.openURL` for `tel:`, `mailto:`, `sms:`, `maps:`, `facetime:` and
`itms-apps:`. The web already keeps same-host links in the WebView and sends
only the others here.

Shell-side safety net: also route these through `onShouldStartLoadWithRequest`
(non-same-host, non-http schemes) and `onOpenWindow`, in case a link escapes the
web handler.

### `biometricLock` (request)
```json
{ "type": "biometricLock", "id": "w4" }
{ "type": "biometricLock", "id": "w5", "enabled": true }
```
Without `enabled`, read the setting. With it, change the Face ID lock-on-resume
setting. Result: `{ "enabled": boolean, "available": boolean }`, where
`available` is false when no biometrics are enrolled.

The portal's Settings toggle "Require Face ID to open the app" (app only, off by
default) reads the setting on mount and sends `enabled` when the rep flips it.
The shell owns the setting: it stores it on the device (for example in
SecureStore), applies it on the next resume, and replies with the stored value.
If turning it on needs a Face ID check and the rep cancels, reply with code
`canceled` and leave the setting unchanged. The web mirrors the reply in
`localStorage['3c-face-id-lock']` (`on`/`off`) only to draw the toggle before
the shell answers; that copy is never the source of truth.

### `nativeSignIn` (request, SPEC A2)
```json
{ "type": "nativeSignIn", "id": "w6", "provider": "google" }
{ "type": "nativeSignIn", "id": "w7", "provider": "apple", "nonce": "<sha256 hex>" }
```
Run the native sign-in sheet.

- Google: `@react-native-google-signin/google-signin` with the Firebase web
  client ID as `webClientId`. Result:
  `{ "provider": "google", "idToken": "...", "accessToken": "..." }`
  (`accessToken` is optional).
- Apple: `expo-apple-authentication` `signInAsync({ nonce, requestedScopes: [FULL_NAME, EMAIL] })`.
  Pass the `nonce` exactly as received. It is already the SHA-256 of the raw
  nonce, which never leaves the web. Result:
  `{ "provider": "apple", "idToken": "<identityToken>", "fullName": { "givenName": "...", "familyName": "..." } | null, "email": "..." | null }`.
  Apple sends the name only on the first authorization, so always forward it.

The web then calls `signInWithCredential` with
`GoogleAuthProvider.credential(idToken)` or
`OAuthProvider('apple.com').credential({ idToken, rawNonce })`. On cancel,
reply `code: "canceled"`. If Sign in with Apple is not available or set up,
reply `code: "not_configured"`.

### Native chat: origin check and token hygiene

The shell must act on `nativeAuth`, `nativeSignOut` and `openNativeChat` only
when `event.nativeEvent.url` is on the portal origin
(`https://www.3cworldgroup.com`, or the dev origin in a dev build). Drop them
from any other page the WebView may have loaded. Never log, persist or send
anywhere the `customToken` (or any Firebase token): no `console.log`, no crash
reporter breadcrumbs, no analytics.

### `nativeAuth` (request, native chat)
```json
{ "type": "nativeAuth", "id": "w8", "customToken": "<firebase custom token>" }
```
Sign the shell's own Firebase Auth (`@react-native-firebase/auth`, used by the
native chat screen) in with `signInWithCustomToken(customToken)`, then reply
`{ ok: true }` (no result needed). On any failure reply `ok: false`
(`code: "failed"`); the web then keeps chat on the web page. The web marks
native chat usable for a uid only after this ok reply.

The web gets the token from `POST /api/portal/auth/custom-token` (Bearer ID
token, checked for revocation; active accounts only; the uid comes from the
token, never the body). It sends it only while the shell advertises
`nativeChat` (and the bridge is present): at once for the first auth event after
a page load, then on each ID-token refresh (`onIdTokenChanged`) debounced 1.5 s,
at most once every 5 minutes for the same uid. If the web user changes after a
token was sent, the web first posts `nativeSignOut`, then sends `nativeAuth`
for the new user. Custom tokens expire after an hour; the native SDK keeps its
own session after signing in.

### `nativeSignOut` (event, native chat)
```json
{ "type": "nativeSignOut" }
```
The web signed out, loaded signed out, or switched accounts. Sign the native
Firebase Auth out and close the native chat screen if it is open. No reply.

### `openNativeChat` (request, native chat)
```json
{ "type": "openNativeChat", "id": "w9" }
{ "type": "openNativeChat", "id": "w10", "channelId": "<chat channel id>" }
```
Show the native chat screen, on `channelId` when given, else the channel list,
and reply `{ ok: true }` once it is showing. Reply `ok: false` if it cannot
open (for example the native sign-in is gone). **Answer within 1.5 s**: on a
failed reply or no reply in time, the web opens its own chat page instead.

Sent only when the shell advertised `nativeChat` (see `capabilities` below) and
answered the current web user's `nativeAuth` with ok. It replaces every way into
`/portal/chat` inside the app: the Chat tab and nav links, the command palette,
any in-page chat link, and a direct load of `/portal/chat?channel=<id>` (a push
tap). On a direct load the web shows a short "Opening chat…" screen while the
native sign-in and the open are under way (no flash of the web chat); after the
ok reply it steps back in history, or replaces its page with
`/portal/dashboard` on a cold load, so that page stays behind the native
screen. If the open fails the web chat shows. Without the capability, chat stays
the web page exactly as before.

## native -> web events

### `capabilities`
```json
{ "source": "3c-shell", "type": "capabilities", "capabilities": { "nativeChat": true } }
```
What this shell build supports beyond contract v1. Known flags: `nativeChat`
(boolean). Unknown keys are ignored; a later message overrides an earlier one
flag by flag, so `{ "nativeChat": false }` backs out: chat goes back to the web
page and no more custom tokens are fetched. Like every native -> web message, a
DOM `message` event is accepted only with this window as its source, so an
iframe cannot fake it. Preferred: also inject `window.__3C_APP_CAPS__ = { nativeChat: true };`
in `injectedJavaScriptBeforeContentLoaded`, so the page knows before its first
render; otherwise send the message after every page load (`onLoadEnd`). A
message overrides the injected value.

### `pushToken`
```json
{ "source": "3c-shell", "type": "pushToken", "token": "<new fcm token>" }
```
Send this whenever FCM issues or rotates the token (`onTokenRefresh`). If the
person is signed in, the web registers it.

## Push payload the shell receives (A4)

Native tokens get an FCM message with `notification: { title, body }`,
`data: { title, body, url }` and `apns.payload.aps: { sound: "default", badge: 1 }`.
`apns-priority: 10` is added for urgent (chat) pushes. When a notification is
tapped, load `data.url` in the WebView. It is a portal path such as
`/portal/chat`; resolve it against `https://www.3cworldgroup.com`.
