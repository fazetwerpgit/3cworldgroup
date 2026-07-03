# Chat Media + Extras (theme-correct overlays, photos/GIFs, add people, reply/edit, unread, pins)

Client decisions (2026-07-03): GIFs = BOTH device uploads and built-in GIF search
(search dormant until a free Tenor key is added — same pattern as VAPID push).
Add people = ADMINS ONLY. Extras approved: reply-to, edit own messages, unread
badges, pinned messages. Channel info sheet must follow the active theme.

## Global Constraints (bind every task)

- Design system per docs/redesign/ANCHOR.md: navy #0A1F44 / lime #8dc63f (lime
  ONLY for primary action buttons with navy text, focus, small accents), every
  light class gets a dark: variant, portal-enter motion vocabulary, tabular nums.
- Auth: every new/changed chat API uses getVerifiedChatUser (src/lib/chat/access)
  and channel access checks BEFORE reading/writing data. Identity is stamped
  server-side; never trust client-supplied author fields.
- Zero new npm dependencies. No breaking changes to existing message docs —
  all new fields optional; old messages must render exactly as today.
- Message docs live at chatChannels/{channelId}/messages/{id}. Clients read
  them realtime via Firestore member-based rules; ALL writes go through API
  routes (admin SDK). Keep it that way for messages. Exception: per-user read
  receipts (Task 6) are client-written to the user's own subcollection.
- Optimistic-send reconciliation in src/app/portal/chat/page.tsx (pendingMessages
  + synchronous reconcile in the threadMessages memo) is load-bearing. Do not
  regress it; extend it so attachment sends reconcile the same way.
- Desktop (lg+) chat keeps its card-message layout; mobile keeps Connecteam
  bubbles. New affordances must land in BOTH.
- Tests: vitest route tests colocated (route.test.ts) following the existing
  mock patterns in src/app/api/portal/chat/**. Run `npx vitest run` scoped to
  your files + `npx tsc --noEmit` before reporting DONE. Do NOT git commit —
  the orchestrator commits after review.
- PowerShell env: implementers should prefer the provided file tools; no
  interactive commands.

## Task 1 — Theme reaches portaled overlays (dark-mode sheet fix)

Problem: ThemeProvider (src/contexts/ThemeContext.tsx) puts the `dark` class on
a wrapper div inside the portal tree. Radix Sheet/Dialog/Dropdown content
portals to document.body — OUTSIDE that wrapper — so every sheet/dialog stays
light in dark mode (user-visible on ChannelInfoSheet, SaleDetailSheet, confirm
dialogs) and also misses `.portal-scope` token/focus rules.

Fix (file: src/contexts/ThemeContext.tsx ONLY): in an effect keyed on
resolvedTheme, mirror classes onto document.body — add `portal-scope` always
while the provider is mounted, toggle `dark` to match resolvedTheme; remove
both on unmount. Keep the existing wrapper div exactly as is (harmless double
application). Guard SSR (effect only). The public marketing site must be
unaffected: ThemeProvider mounts only under /portal, and unmount cleanup
removes both classes.

Verify: tsc clean; then state in your report the exact class-toggling code
path so the reviewer can check add/remove symmetry (theme switches
light→dark→light must not leak classes).

## Task 2 — Media backend: attachments, upload route, GIF search proxy

Files: src/types/chat.ts; src/app/api/portal/chat/messages/route.ts (+ its
route.test.ts); NEW src/app/api/portal/chat/media/route.ts (+ test); NEW
src/app/api/portal/chat/gifs/route.ts (+ test); NEW src/lib/chat/media.ts if
helpers warrant it.

Schema (types/chat.ts): `ChatAttachment { type: 'image' | 'gif'; url: string;
width?: number; height?: number; contentType?: string }`. ChatMessage gains
`attachment?: ChatAttachment` and `hasAttachment?: boolean` (flag exists so
Firestore can query media messages; set true iff attachment present).

Upload route — POST /api/portal/chat/media, multipart formData: fields
`channelId`, `file`. getVerifiedChatUser + channel exists + canAccessChatChannel
gate first. Accept ONLY image/png, image/jpeg, image/webp, image/gif; max
10 MB; reject others 400. Write to the existing Firebase admin storage bucket
(inspect src/lib/firebase/admin.ts and the onboarding upload route for the
bucket helper pattern) at `chat/{channelId}/{uuid}.{ext}` with a
firebaseStorageDownloadTokens UUID in metadata; return the tokened download
URL ({ url, contentType }). Storage rules stay deny-all (token URLs work
regardless).

Messages POST: accept optional `attachment` — validate shape server-side:
type image → url must start with the exact storage-download prefix for THIS
channel's folder (prevents cross-channel/foreign URLs); type gif → url host
must be media.tenor.com (https). width/height clamped finite positive ≤ 4096.
`text` becomes optional when a valid attachment is present (text still capped
1000; empty text + attachment is a valid message). Persist attachment +
hasAttachment. GET mapping returns attachment through.

GIF proxy — GET /api/portal/chat/gifs?q=...: verified chat user required. If
process.env.TENOR_API_KEY is unset return 200 { enabled: false, results: [] }.
Else call Tenor v2 https://tenor.googleapis.com/v2/search?q=...&key=...&limit=24
&media_filter=gif,tinygif&contentfilter=medium and map to
{ enabled: true, results: [{ id, url (formats.gif.url), previewUrl
(formats.tinygif.url), width, height }] }. Also support empty q → featured
endpoint. Never expose the key to the client.

Media list — GET /api/portal/chat/channels/[channelId]/media (add to the NEW
media route? No — separate handler file under the existing
channels/[channelId]/ folder as media/route.ts): verified + access gate, query
messages where hasAttachment == true, not deleted, orderBy createdAt desc,
limit 60; return [{ messageId, attachment, authorName, createdAt }].

Tests: auth 401, wrong-audience 403, mime/size rejects, foreign-URL attachment
reject, tenor-host enforcement, gifs disabled path, media list happy path.

## Task 3 — Media UI: composer attach + GIF picker + image bubbles + lightbox + media gallery

Files: src/app/portal/chat/page.tsx; src/components/chat/MobileThread.tsx;
src/hooks/useMessages.ts (mapping only); src/components/chat/ChannelInfoSheet.tsx
(media section); NEW src/components/chat/GifPicker.tsx; NEW
src/components/chat/ChatLightbox.tsx.

- useMessages: map `attachment` + `hasAttachment` from snapshots (defensive:
  ignore malformed).
- Composer (both mobile + desktop): an ImagePlus icon button opens a hidden
  file input (accept="image/*"); picking a file shows a small preview chip
  (thumbnail + filename + X to clear) above the composer. Send flow: upload to
  /api/portal/chat/media first (spinner state on the send button), then POST
  the message with the returned attachment; failures surface like existing
  failed sends (retry/discard). Client-side pre-check mirrors server limits
  (type/10MB) with a friendly error. Images >2000px on the long edge are
  downscaled client-side to JPEG before upload (reuse the canvas/ImageBitmap
  approach from the onboarding FileUpload component — inspect it; do not
  import it, chat needs its own tiny helper).
- GIF button (sparkle/gif icon) next to attach: opens GifPicker — a popover/
  sheet with a search input (debounced 300ms) hitting /api/portal/chat/gifs,
  responsive thumbnail grid (previewUrl), tap → sends immediately as a gif
  attachment message. If the API says enabled:false, do not render the GIF
  button at all (feature dormant until key).
- Rendering (both layouts): attachment renders as a rounded image (max-h-64,
  object-cover, lazy loading, subtle ring border, navy-tinted skeleton while
  loading) above the text (if any). Optimistic pending bubble shows the local
  preview with an uploading shimmer. Tap/click any image → ChatLightbox:
  full-screen portaled overlay (bg-black/90), image contained, close on
  backdrop/Esc/X, author + time caption. Dark-mode correct out of the box.
- ChannelInfoSheet: add a "Media" section under members (or segmented
  Members | Media control): lazy-fetches the media endpoint when first shown,
  3-column thumbnail grid, tap → same lightbox, empty state "No photos yet."
- Existing optimistic reconcile must treat attachment messages one-to-one just
  like text messages (echo carries the attachment; reconcile on server echo).

## Task 4 — Add people to channels (admins only)

Files: src/lib/chat/channels.ts (+ channels.test.ts); the channel-list
endpoint the chat page uses (find it: the hook is src/hooks/useChatChannels —
inspect and extend its API route); src/app/api/portal/chat/channels/[channelId]/members/route.ts
(+ test); NEW src/app/api/portal/chat/channels/[channelId]/members/manage/route.ts
(+ test); src/components/chat/ChannelInfoSheet.tsx.

Model: channel docs gain `extraMemberIds: string[]` (manually added people).
syncChatChannels writes memberIds = union(audience-derived, extraMemberIds ∩
existing users) so Firestore realtime rules (memberIds-based) keep working and
manual additions SURVIVE sync. ensureChatChannelMember unchanged.

Access: a uid in extraMemberIds gets access even when the role check fails.
Add a server helper (channels.ts) `userCanAccessChannelDoc(channelDocData,
{ uid, role, fieldRole })` = canAccessChatChannel(...) || extraMemberIds
includes uid — and use it in messages route, members route, media route, and
the channel-list route (added rep must SEE the channel in their list; list
route must include extra-member channels for that uid).

Manage route: POST { uid } adds, DELETE { uid } removes — requester must be
platform admin (role === 'admin'; inspect getVerifiedChatUser for the field).
Add = arrayUnion on extraMemberIds AND memberIds; remove = arrayRemove from
extraMemberIds, and from memberIds ONLY if the user isn't audience-derived
(recompute with canAccessChatChannel for that user's roles). 404 unknown
channel, 400 unknown uid or removing a non-extra member.

Members GET: include `isExtra: boolean` per member, plus admin-only
`addable: [{uid,name,role}]` (active users not already members, capped 50,
only when the requester is admin — non-admins never receive it).

Sheet UI (admins only): "Add people" button under the member-count row →
expands an inline panel listing addable users (same row style) each with a
lime "Add" pill (navy text); extra members show a small "Added" badge and an
X remove affordance with a plain confirm. All mutations optimistic-refresh
the member list. Non-admins see zero new UI.

Tests: non-admin 403 on manage; add→member appears with isExtra; remove
audience-derived member 400; sync preserves extras (channels.test.ts).

## Task 5 — Reply-to + edit own messages

Files: src/types/chat.ts; src/app/api/portal/chat/messages/route.ts (+ test);
src/hooks/useMessages.ts (mapping); src/app/portal/chat/page.tsx;
src/components/chat/MobileThread.tsx; NEW src/components/chat/MessageActions.tsx
(shared action menu).

Schema: ChatMessage gains `replyTo?: { messageId: string; authorName: string;
text: string }` (snippet ≤ 140 chars, server-resolved) and `editedAt?: Date`.

API: POST accepts optional `replyToMessageId` — server loads that message from
the SAME channel (400 if missing/deleted) and stamps the snippet from the
stored doc (never trust client text; snippet = text slice 140, or "Photo"/"GIF"
when it was attachment-only). NEW PATCH handler: { channelId, messageId,
text } — author ONLY (moderators cannot edit others), message not deleted,
same 1..1000 validation, sets text + editedAt serverTimestamp, attachment
untouched.

UI (both layouts):
- MessageActions: mobile = long-press (500ms touch, cancel on move/scroll)
  opens a bottom action sheet; desktop = hover reveals a small "..." button
  opening a dropdown. Items: Reply (everyone), Copy text (everyone, hidden if
  no text), Edit (own messages), Delete (own or moderator — reuse the EXACT
  existing delete handler/confirm; do not duplicate logic). Wire the existing
  delete affordance into this menu rather than leaving two competing controls.
- Reply flow: composer shows a quoted bar (author + snippet, lime 2px left
  border, X to cancel); sent message renders the quote block above its text
  (muted, truncated, both bubble + card styles, dark variants).
- Edit flow: composer switches to edit mode (prefilled text, "Editing message"
  bar with X); save via PATCH; realtime updates the message; render a subtle
  "(edited)" suffix next to the timestamp when editedAt exists.
- Optimistic: edits apply locally immediately and reconcile on snapshot.

Tests: PATCH non-author 403, deleted 400, happy path sets editedAt; replyTo
resolution stamps server snippet and rejects cross-channel/unknown ids.

## Task 6 — Unread badges

Files: src/app/api/portal/chat/messages/route.ts (bump channel lastMessageAt);
firestore.rules (chatReads subcollection); NEW src/hooks/useChatUnread.ts;
src/components/chat/MobileChannelList.tsx; src/components/portal/MobileBottomNav.tsx;
src/app/portal/chat/page.tsx (desktop channel rail badges + mark-read wiring).

Mechanics: messages POST also merges { lastMessageAt: serverTimestamp() } onto
the channel doc. Per-user read state lives at users/{uid}/chatReads/{channelId}
{ lastReadAt } — written DIRECTLY by the client (rules: read/write only when
request.auth.uid == uid; validate lastReadAt is a timestamp). Mark read when
the thread is open/visible and again as new messages arrive while viewing.

useChatUnread(channels, uid): subscribes the user's chatReads collection +
uses the channel docs' lastMessageAt (already streaming via useChatChannels —
inspect; if the hook doesn't stream lastMessageAt, map it through). A channel
is unread when lastMessageAt > lastReadAt (missing read doc counts as unread
only if lastMessageAt exists). Expose { unreadByChannel: Record<string,
boolean>, anyUnread }. Dot-style badges (no counts — counts need per-channel
message queries; keep it light): lime dot with navy ring on the channel row
(list + desktop rail, name goes font-semibold when unread) and a dot on the
bottom-nav Chat icon + desktop sidebar can be skipped this round.

Own sends must not badge: marking read on send/view covers this — verify.

Tests: pure unread-computation helper unit-tested (extract computeUnread into
the hook file or lib and test it); rules change is orchestrator-deployed.

## Task 7 — Pinned messages

Files: src/types/chat.ts; NEW src/app/api/portal/chat/messages/pin/route.ts
(+ test); src/hooks/useMessages.ts (mapping); src/components/chat/MessageActions.tsx;
src/app/portal/chat/page.tsx; src/components/chat/MobileThread.tsx;
src/components/chat/ChannelInfoSheet.tsx.

Schema: ChatMessage gains `isPinned?: boolean`, `pinnedAt?`, `pinnedBy?`.

API: POST { channelId, messageId, pinned: boolean } — allowed for platform
admin/operations OR l1/l2 managers (inspect getVerifiedChatUser's fields;
reps 403). Message must exist and not be deleted. Sets/clears isPinned +
pinnedAt/pinnedBy. GET pinned list: reuse the ChannelInfoSheet fetch — add
GET /api/portal/chat/channels/[channelId]/pins? No: query via the pin route's
GET (same file): verified + access gate, where isPinned == true, orderBy
pinnedAt desc, limit 20, returns [{ messageId, text, attachment, authorName,
createdAt }].

UI: Pin/Unpin item in MessageActions (allowed roles only); pinned messages get
a tiny Pin icon next to the timestamp; ChannelInfoSheet gains a "Pinned"
section (above Media): list of pinned messages (author, snippet or thumbnail,
time), empty state hidden entirely when none. Tap a pinned image → lightbox.

Tests: rep 403, manager pin/unpin happy path, deleted message 400, pins list
respects access gate.

## Verification & ship (orchestrator)

Per task: tsc + scoped vitest by implementer; Fable reviewer on scoped diff;
fix loop; ledger. After all: full `npx vitest run` + `npx tsc --noEmit` +
`npm run build`; deploy firestore.rules (`firebase deploy --only
firestore:rules`); Playwright visual pass light/dark/mobile (dark sheet MUST
be navy now); screenshots to client; merge → master → push (Vercel). Send the
client the 5-minute Tenor key instructions (Google Cloud console → enable
Tenor API → API key → Vercel env TENOR_API_KEY).
