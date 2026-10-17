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
`biometricLock`, 5 min for `nativeSignIn`, 10 min for `share` and `saveFile`).
A late reply is ignored.

Messages without an `id` (`haptic`, `openExternal`, `statusBar`) are
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

Shell-side safety net for downloads the web does not route: a
`Content-Disposition: attachment` navigation (`onFileDownload`) or a click on a
same-origin `<a download href="https://...">` makes the page fetch the file
itself (with its cookies) and post a normal `saveFile` with an id starting
`shell-download-`. The web ignores the reply (no pending request has that id).
If the fetch fails, the shell opens the URL with `openExternal`.

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

### `statusBar` (event)
```json
{ "type": "statusBar", "style": "light" }
```
`style`: `light` (white status bar text, for a dark page) | `dark` (black text,
for a light page). Any other value is dropped.

The web (`src/lib/app/statusBar.ts`, from `AppBridgeHost`) sends it on mount and
whenever the page theme changes: the `dark` class on `<body>` (ThemeContext)
means `light`; without it the old light chrome (white `.portal-shell-header`)
shows, so `dark`. It sends only on a change. The shell defaults to `light`
before the first message, and its own screens (lock, privacy cover, offline)
always use `light`. Older shells ignore it.

## native -> web events

### `pushToken`
```json
{ "source": "3c-shell", "type": "pushToken", "token": "<new fcm token>" }
```
Send this whenever FCM issues or rotates the token (`onTokenRefresh`). If the
person is signed in, the web registers it.

### `visible`
```json
{ "source": "3c-shell", "type": "visible", "visible": true }
```
Whether the portal is really on screen. The WebView loads behind the splash,
the cold-start cover and the Face ID lock, so without this the portal's
once-per-session reveals and count-ups play unseen and spend their
sessionStorage keys (which also live for days in WKWebView).

- `true` once the splash is hidden, no lock or privacy cover is up and the app
  is in the foreground; `false` when it is covered again or backgrounded.
  Sent on every change and again at the end of every page load.
- The shell also keeps `window.__3C_VISIBLE__` current: it is set before content
  on every page load (starting `false` until the portal is on screen) and
  updated by each `visible` injection before `receive` runs. The flag being
  defined is how the web knows the shell sends `visible`; in older shells it is
  undefined and the page counts as visible.
- Web (`src/lib/app/appVisibility.ts`): in the app, `useFirstReveal` and
  `useCountUp` wait for visible before deciding to play and before marking
  their keys. On the web nothing changes.

### `resumed`
```json
{ "source": "3c-shell", "type": "resumed", "awayMs": 1860000 }
```
The app came back after 30+ minutes in the background. Sent before the matching
`visible: true`. The web clears its `3c:reveal:*` and `3c:countup:*`
sessionStorage keys so reveals replay, as in a relaunched PWA.

## Push payload the shell receives (A4)

Native tokens get an FCM message with `notification: { title, body }`,
`data: { title, body, url }` and `apns.payload.aps: { sound: "default", badge: 1 }`.
`apns-priority: 10` is added for urgent (chat) pushes. When a notification is
tapped, load `data.url` in the WebView. It is a portal path such as
`/portal/chat`; resolve it against `https://www.3cworldgroup.com`.
