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

Messages without an `id` (`haptic`, `openExternal`, `statusBar`,
`nativeSignOut`, `chatContext`, `ready`, `badge`, `widgetData`) are
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

Shell-side fallback for downloads the web does not route itself. Two cases are
covered: a `Content-Disposition: attachment` navigation (`onFileDownload`), and
a tap on a same-origin `<a download href="https://...">` that no portal handler
took. In both, a helper script the shell injects before content fetches the file
in the page (same origin, with the page's cookies). It then posts a normal
`saveFile` whose id starts with `shell-download-`.

- While it fetches, the helper shows a `notice` (`progress`, "Preparing
  download…"). One download runs per URL; a second tap only shows that notice
  again.
- An HTTP error (4xx/5xx) shows an error `notice` and plays the `error` haptic.
  The same happens for a file over the bridge cap (about 56 MB, checked before
  encoding). Neither opens the URL anywhere else.
- Only a network failure of the fetch itself (no response at all) hands the URL
  to `openExternal`.
- The shell consumes the `saveFile` reply; the web never sees it. Success plays
  the `success` haptic and shows "Download ready." A failure plays the `error`
  haptic and shows the reason. A cancel shows nothing.

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
Without `enabled`, read the setting. With it, change the app lock-on-resume
setting. Result: `{ "enabled": boolean, "available": boolean }`. `available`
is true when Face ID / Touch ID is enrolled or the device has a passcode
(iOS falls back to the passcode). It is false only when the device has no
passcode at all.

The portal's Settings toggle "Require Face ID or passcode to open the app" (app
only, off by default) reads the setting on mount and sends `enabled` when the rep flips it.
The shell owns the setting: it stores it on the device (for example in
SecureStore), applies it on the next resume, and replies with the stored value.
If turning it on needs a Face ID or passcode check and the rep cancels, reply with code
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

One sheet at a time. While one is open, a request with the same provider and
nonce (a double tap) shares its result. Any other request is answered
`canceled`. A sheet still open after 120 s stops blocking new requests. The web
also drops a second tap while its request is pending, and shows no message for
`canceled`.

### `statusBar` (event)
```json
{ "type": "statusBar", "style": "light" }
```
`style`: `light` (white status bar text, for a dark page) | `dark` (black text,
for a light page). Any other value is dropped.

The web (`src/lib/app/statusBar.ts`, from `AppBridgeHost`) sends it on mount and
whenever the page theme changes, and only when the style changes. It reads the
classes ThemeContext puts on `<body>`:

- `portal-scope` and `dark`: dark page, so `light`.
- `portal-scope` without `dark`: the old light chrome (white
  `.portal-shell-header`), so `dark`.
- No `portal-scope` yet (before ThemeProvider runs, or outside the portal):
  `light`, so the bar never flashes dark.

The shell defaults to `light` before the first message, and its own screens
(lock, privacy cover, offline) always use `light`. Older shells ignore it.

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
`{ ok: true, result: { uid } }` with the uid the native Auth is now signed in
as. On any failure reply `ok: false` (`code: "failed"`); the web then keeps
chat on the web page. The web marks native chat usable for a uid only after
an ok reply whose `uid` equals the current web user's uid; an ok reply with a
different uid, or with none, counts as a failure.

The web gets the token from `POST /api/portal/auth/custom-token` (Bearer ID
token, checked for revocation; active accounts only; the uid comes from the
token, never the body; the web aborts the fetch after 8 s and counts that as a
failure). It sends it only while the shell advertises
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
failed reply or no reply in time, the web opens its own chat page instead, and
keeps chat on the web page for the next 45 s (no `openNativeChat` at all), so a
broken native screen does not cost every navigation another 1.5 s wait.

Sent only when the shell advertised `nativeChat` (see `capabilities` below) and
answered the current web user's `nativeAuth` with ok. It replaces every way into
`/portal/chat` inside the app: the Chat tab and nav links, the command palette,
any in-page chat link, and a direct load of `/portal/chat?channel=<id>` (a push
tap). On a direct load the web shows a short "Opening chat…" screen while the
native sign-in and the open are under way (no flash of the web chat), but waits
at most 3 s for the sign-in before showing the web chat; after the ok reply it
steps back in history, or replaces its page with `/portal/dashboard` on a cold
load, so that page stays behind the native screen. If the open fails the web
chat shows. Native or web is decided once per stay on `/portal/chat`: once the
web chat has shown, a `nativeAuth` ok that lands later does not send
`openNativeChat` until the person leaves and comes back, and at most one
`openNativeChat` goes out per stay. Without the capability, chat stays
the web page exactly as before.
### Native chat: the same API, terms gate and user agent

The native chat screen is a client of the same portal chat API as the web,
with the same Bearer ID token (from its own Firebase Auth session) and no
native-only routes or rules:

- send, edit, delete: `/api/portal/chat/messages`
- photo / PDF upload: `POST /api/portal/chat/media` (two forms, below)
- report: `POST /api/portal/chat/messages/report`
- block list, block, unblock: `GET` / `POST` / `DELETE /api/portal/chat/blocks`
- the chat agreement: `/api/portal/chat/terms`

**Uploads.** Vercel refuses request bodies over about 4.5 MB, so a multipart
upload only works for small files. The web switches at 4 MB
(`DIRECT_UPLOAD_THRESHOLD`, `src/components/chat/attachmentUpload.ts`); the
native screen should do the same:

- up to 4 MB: multipart `channelId` + `file`, as before.
- over 4 MB (PDFs and GIFs up to 10 MB): upload the bytes with
  `@react-native-firebase/storage` to
  `chat-pending/{uid}/{id}.{ext}`, where `uid` is the native Firebase user (the
  custom-token sign-in), `id` is 8 to 64 of `[A-Za-z0-9-]` (a UUID), and `ext`
  is `pdf`, `png`, `jpg`, `webp` or `gif`. Set `contentType` to the matching
  type (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`,
  `image/gif`). storage.rules refuse any other path, type, an empty file, a
  file over 10 MB, and any overwrite. Then `POST /api/portal/chat/media` with
  JSON `{ "channelId": "...", "pendingPath": "chat-pending/...", "name":
  "Original name.pdf" }` (`name` only for a PDF). The response is the same as
  the multipart form: `{ url, contentType, name?, size? }`. The route checks
  the caller owns the path, the channel, the chat agreement, size, type and
  the PDF header, filters the name, and moves the file; a refused upload is
  deleted. A 404 means the pending object is gone: upload again under a new id.

Every request it makes sends the user agent `3CPortal 3CPortalApp/<version>`.
The server treats any user agent carrying `3CPortalApp/` as an app caller
(`src/lib/chat/terms.ts`): until `users/{uid}.chatTermsAcceptedAt` is set, a
send AND an upload from an app caller are refused with `403
{ code: "chat_terms" }` (the upload is refused before any bytes are stored, so
no orphaned attachment is left behind). Show the agreement, accept it through
the terms route, then retry. Report and block go to the back office exactly as
they do from the web. A demo (App Review) account sees only the demo sandbox
channel (`docs/ios-app/APP-REVIEW-DEMO.md`).

### `chatContext` (event)
```json
{ "type": "chatContext", "channelId": "general" }
{ "type": "chatContext", "channelId": null }
```
Sent by the team chat page whenever the conversation on screen changes:
the open channel id, or `null` when no thread is showing (the phone channel
list, or leaving chat). The shell keeps the latest value and uses it to drop
the foreground banner for a push about that channel (see "Foreground pushes"
below). It is a hint, not a lock: a shell that never hears `null` (for
example the page crashed) should also forget it when the WebView navigates
away from `/portal/chat`.

### Shell extras: `ready`, `badge`, `widgetData` (events)

Added on top of v1 for the shell's `native-extras` work (shell contract:
`docs/NATIVE-EXTRAS.md` in the app repo). No `id`, no reply; a shell that does
not know them drops them. Senders: `src/lib/app/shellExtras.ts`. Nothing is
sent outside the app.

#### `ready`
```json
{ "type": "ready" }
```
The first real screen is painted, so the shell can drop its splash. Sent once
per page load, two animation frames after the screen commits. The portal
layout also serves `<meta name="3c-app-ready" content="v1">`, which the shell's
load-end probe reads to know this page will send `ready` (it waits at most 3 s).

Who sends it: the login page once the auth check settles signed out (login
form or pending approval), the rep dashboard once the money block leaves its
skeleton (data or error), the owner dashboard once the money board settles,
and `AppBridgeHost` for any other first route (notification tap, quick action)
once auth resolves.

#### `badge`
```json
{ "type": "badge", "count": 3 }
```
The icon badge: the number of unread chat channels (the same comparison as the
tab bar's unread dot, `useChatUnread`). Sent by `NativeBadgeSync` (mounted by
`AppBridgeHost` for a signed-in person in the app) whenever the count changes.
`0` is sent when signed out.

#### `widgetData`
```json
{ "type": "widgetData", "data": { "uidHash": "ba7816bf8f01cfea", "estPayMtd": 1235, "periodLabel": "October", "rank": 3, "rankOf": 28, "salesMtd": 9, "updatedAt": "2026-10-17T15:00:00.000Z" } }
{ "type": "widgetData", "data": null }
```
The home-screen widget's numbers, from the rep dashboard's own data:

- `uidHash`: first 16 hex chars of SHA-256 of the uid (Web Crypto). The shell
  clears the widget and badge when it changes.
- `estPayMtd`: the dashboard's "Estimated pay this month" (`summarizePay`
  `estThisMonth`), whole dollars, negative when chargebacks net it below zero;
  `null` when the person has no comp plan (shown as "Not on a plan").
- `periodLabel`: the month name in America/Chicago.
- `rank` / `rankOf`: this week's leaderboard standing as the dashboard shows
  it; `null` when unranked or the standing failed to load.
- `salesMtd`: the dashboard's "N sales this month".
- There is never a pay date (estimates only).

Sent when the numbers change (`updatedAt` aside), and again after 30 min with
the same numbers. Never sent while the owner is viewing as a rep. `null` is
sent when signed out. Owners (company dashboard) send nothing.

## native -> web events

### `capabilities`
```json
{ "source": "3c-shell", "type": "capabilities", "capabilities": { "nativeChat": true } }
```
What this shell build supports beyond contract v1. Known flags: `nativeChat`
(boolean). Unknown keys are ignored.

**Primary source: `window.__3C_APP_CAPS__`.** The shell injects
`window.__3C_APP_CAPS__ = { nativeChat: true };` in
`injectedJavaScriptBeforeContentLoaded`, so it is set before any page script
runs and the page knows from its first render (no flash of the web chat, no
wait for a message). The web reads it live (`readCapabilities()` in
`src/lib/app/nativeChat.ts`); it is what every check starts from.

**Update: the `capabilities` message.** Send it when a flag changes at runtime,
and after every page load (`onLoadEnd`) for shells that cannot inject. It is
merged over the injected value flag by flag (a later message over an earlier
one too), so `{ "nativeChat": false }` backs out: chat goes back to the web
page and no more custom tokens are fetched. A flag the message leaves out keeps
its injected value. Like every native -> web message, a DOM `message` event is
accepted only with this window as its source, so an iframe cannot fake it.

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
  is in the foreground. `false` when it is covered again or backgrounded.
  Sent on every change, and again at the end of every full page load (including
  a reload after the web content process crashed).
- The shell also keeps `window.__3C_VISIBLE__` current. The before-content
  script sets it to the visibility at the time the WebView was mounted.
  Every `visible` injection updates it before `receive` runs. Because a full
  page load can start with a stale value, the shell sends `visible` again when
  the load ends.
- The flag being defined is how the web knows the shell sends `visible`. In
  older shells it is undefined, and the page counts as visible.
- Web (`src/lib/app/appVisibility.ts`): in the app, `useFirstReveal` and
  `useCountUp` wait for visible before deciding to play and before marking
  their keys. On the web nothing changes.

### `notice`
```json
{ "source": "3c-shell", "type": "notice", "id": "shell-download-1-1", "kind": "progress", "message": "Preparing download…" }
```
A short status toast, used for downloads (see `saveFile`). `kind` is `progress`,
`success`, `error` or `dismiss`.

- A notice with the same `id` replaces the current one.
- `dismiss` removes the toast only if its `id` matches.
- `progress` stays until it is replaced. `success` and `error` hide by
  themselves.
- Web: `src/components/app/AppNotice.tsx`, in the app only.

### `resumed`
```json
{ "source": "3c-shell", "type": "resumed", "awayMs": 1860000 }
```
The app came back after 30+ minutes in the background. Always sent before the
`visible: true` that follows it. The web clears its `3c:reveal:*` and `3c:countup:*`
sessionStorage keys so reveals replay, as in a relaunched PWA.
### `keyboard`
```json
{ "source": "3c-shell", "type": "keyboard", "height": 336, "duration": 250, "easing": "keyboard" }
```
Sent from React Native's `keyboardWillShow`, `keyboardWillChangeFrame` and
`keyboardWillHide` (hide sends `height: 0`). `height` is how much of the
WebView the keyboard covers, in CSS px (window height minus
`endCoordinates.screenY`, never negative). `duration` is the iOS animation
length in ms (the web clamps it to 0..1000). `easing` is RN's
`event.easing`: `keyboard`, `easeIn`, `easeOut`, `easeInEaseOut` or
`linear`; anything else is read as `keyboard`.

In the app, the chat thread uses this instead of `visualViewport` timing: one
transition on the composer inset (`--kb`) with the keyboard's own duration
and curve, then a single snap to the newest message. The composers that keep
themselves above the keyboard (Ask, Practice, the bulk sale sheet:
`src/hooks/useKeyboardInset.ts`) also switch to this event's `height` once the
first one arrives, so they move as the keys start rather than after the
viewport resizes. When the last of them unmounts the shell height is
forgotten, and the next one starts on the visual viewport until a new event. With the event absent (older shell, browser, PWA) the page
keeps its visualViewport path.

### `navigate`
```json
{ "source": "3c-shell", "type": "navigate", "url": "https://www.3cworldgroup.com/portal/chat?channel=general" }
```
Open a portal URL without reloading the page (a push tap while the app is
running). The web client-side routes same-origin `/portal` URLs
(`router.push`), so the team chat page opens the channel in place. A
same-host URL outside `/portal` is loaded with `location.assign`; any other
host is ignored.

Pages that handle it say so: `window.__3C_BRIDGE__.features` includes
`"navigate"` once the portal's bridge host has mounted. The shell must check
before sending and fall back to `location.assign(url)` otherwise (the login
page, an error page, or a portal build from before this event):

```js
var b = window.__3C_BRIDGE__;
if (b && b.features && b.features.indexOf('navigate') !== -1) b.receive(msg);
else window.location.assign(msg.url);
```

With native chat on (`capabilities.nativeChat` and an ok `nativeAuth`), a
`navigate` to `/portal/chat?channel=<id>` still goes through the web: the page
routes there and hands it to the native screen with `openNativeChat`, the same
as a push-tap deep link.

## Foreground pushes

A push that arrives while the app is open does not show the system banner
(`firebase.json` `messaging_ios_foreground_presentation_options` is
`["badge", "list"]`: it goes to Notification Center and bumps the badge).
The shell shows its own in-app banner from `messaging().onMessage` instead,
unless the push's `data.url` is `/portal/chat?channel=<id>` and `<id>` is
the channel from the latest `chatContext`. Tapping the banner sends
`navigate`. Changing the presentation options needs a native rebuild.

## Push payload the shell receives (A4)

Native tokens get an FCM message with `notification: { title, body }`,
`data: { title, body, url }` and `apns.payload.aps: { sound: "default", badge: <n> }`.
`badge` is the recipient's unread chat channel count (`src/lib/push/unreadBadge.ts`:
their member channels' `lastMessageAt`, at most 100 channels in document-id
order, against `users/{uid}/chatReads` for exactly those channels; native
recipients only). Every push carries it, not only chat pushes, so an alert or
announcement push can lower or clear a stale badge; that is intended. If the
read fails it falls back to `1`.
`apns-priority: 10` is added for urgent (chat) pushes. When a notification is
tapped, send `navigate` with `data.url` when the page advertises it (see
`navigate`), else load `data.url` in the WebView. It is a portal path such as
`/portal/chat`; resolve it against `https://www.3cworldgroup.com`.
