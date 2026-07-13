# Team Chat "The Line" — Visual Parity Goal Contract

User picked mockup Option 3 "The Line: Chat" for `/portal/chat`. Same contract
style as `dashboard-the-line-goal.md` / `shell-the-rail-goal.md` /
`sales-the-line-goal.md`: implementation is verified 1:1 against the mockup
by independent reviewers until EXACT — not close enough.

## Source of truth

- Mockup: `design-mockups/chat-round1/option-3-the-line-chat.html`
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.

## Composition (top to bottom)

1. **Masthead**: `3C WORLD GROUP / THE LINE` brand mark left, center metadata
   `Team chat · broadcast / <Month DD, YYYY>`, right-side `Rep`/`Manager`
   pill switch (translucent dark pill, active = lime bg + navy text). Bottom
   border `1px solid var(--lime)`. Page renders inside the real portal shell
   (PortalHeader/PortalSidebar); the mockup's Rep/Manager switch is a
   **prototype view toggle only** — see Sanctioned deviations for how it
   maps to real role/permission logic.
2. **Desktop layout**: two-pane grid — 276px channel switcher rail (fixed)
   + remaining-width conversation pane. Channel rail: kicker `Channel
   switcher / 01–04`, two-line title `The line / chat`, channel rows (28px
   numbered circle, 9px tick, name, description, audience, member count,
   lime unread dot), active row = lime border + lime inset left stripe (3px)
   + lime-to-navy gradient background, bottom "Signal discipline" PII note.
3. **Conversation header**: kicker `<NN> / <CHANNEL AUDIENCE> / <TYPE>`,
   metallic display title (channel name), one-line description, right side
   presence dot + `LIVE` + member count.
4. **Pinned band**: 3-column grid (label `PINNED` / message / timestamp),
   lime-to-navy gradient background, bottom hairline — shows the channel's
   most recently pinned message.
5. **Message stage**: scrollable region, day dividers (`TODAY`, `YESTERDAY ·
   <MON DD>`, uppercase 9px monospace with flanking hairlines), message rows
   (34px avatar column + bubble column, grouped-message spacing, own-message
   right alignment with lime avatar/stripe/gradient), pinned/edited markers,
   attachment and GIF renders (real images/GIFs, not mockup placeholders —
   see deviations), reply quote blocks, reaction chips, send-status states
   (`Sending…`, `Failed — tap to retry · Discard`). Jump-to-latest pill
   appears when scrolled up with new messages below.
6. **Composer**: optional reply strip, attachment button + textarea + GIF
   button (GIF button conditional on `GIPHY_API_KEY`, per current behavior)
   + send button, lime focus border, PII helper copy, `Enter to send · Shift
   + Enter for line break` keyboard hint (desktop only).
7. **Message actions**: dark backdrop + action sheet (desktop: 260px
   bottom-right panel; mobile: full-width bottom sheet, 5-column grid) with
   `Reply`/`Copy`/`Pin`/`Edit`/`Delete` — each wired to the real handlers in
   `chat/page.tsx` and `MessageActions.tsx`, gated per real permissions (see
   deviations), not the mockup's Rep/Manager toggle.
8. **Channel info / media / pinned tabs, GIF picker, lightbox**: existing
   `ChannelInfoSheet`, `GifPicker`, `ChatLightbox` components restyled to
   the mockup's dark tokens, behavior unchanged.

## Desktop / mobile reflow (exact mockup breakpoint)

### `max-width: 720px`

Desktop channel rail is replaced by a full-screen **mobile channel list**
(kicker `The Line / mobile channel switcher`, title `Team Chat` at 44px
metallic, intro copy, channel rows at `15px 7px` padding with numeral/tick/
copy/audience-badge grid, PII note) shown when no channel/thread is open.
Selecting a channel opens the **mobile conversation view** (`broadcast-head`
→ `pinned-band` → `messages` → `composer-wrap`), toggled via a
`mobile-chat-open` class on the app root per the mockup, mirroring today's
`chatOpen`/back-button state in `chat/page.tsx`. Conversation-view deltas
from desktop: back button (`Back to channel list`), header padding `13px
12px 12px`, 30px display title, single-line-ellipsis 9px description, `LIVE`
label hidden (member count remains), pinned band `8px 12px` with timestamp
hidden, messages padding `16px 10px 24px` (`padding-right: 38px` override),
message grid `25px minmax(0,1fr)`, 24px avatar, role pills hidden, 11px
bubble font, 92px attachment height, 62px GIF height, composer controls
shrink to 30px, send button icon-only, keyboard hint hidden, toast repositions
above the composer.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #030916;
--panel: #0A1F44;
--ink: #f5f7fa;
--muted: #9caabd;
--lime: #8dc63f;
--line: rgba(231,237,244,.14);
--soft: rgba(231,237,244,.07);
--danger: #ef8e8e;
--metal: linear-gradient(180deg,#fff 0%,#dbe4ed 38%,#7f8c9b 80%,#f5f7f8 100%);
```

Body font `"Trebuchet MS","Segoe UI",Arial,sans-serif`; metadata/numerals
`ui-monospace, Consolas, monospace`, uppercase with letter-spacing. Display
titles: metallic gradient, weight 900, uppercase, `letter-spacing: -.12em`.
Desktop conversation title `clamp(44px,7vw,92px)` / `line-height: .78`;
mobile conversation title 30px; mobile "Team Chat" title 44px. Channel
numerals 9px bold monospace in 28×28px lime-outline circles. Hairlines 1px
using `--line`/`--soft`. Background carries a faint 56px grid texture at
`.2` opacity, fading toward the bottom. New chat-specific rules should be
namespaced `chat-line-*` in `globals.css` alongside the existing
`.portal-*` utility conventions, not scattered inline styles.

## Sanctioned deviations from the mockup

- **Rep/Manager switch is not real auth.** The mockup's pill toggle is a
  prototype view switch (extraction Part A, "Important" note); the app has
  no separate Admin mode driven by a UI toggle. Do NOT ship a UI role
  switcher that fakes permission changes. Map the mockup's two visual
  states onto the **real** permission checks already in `chat/page.tsx` /
  `MessageActions.tsx` / channel-access logic:
  - Managers-channel visibility, per-message action visibility (Reply/Copy/
    Pin/Edit/Delete), and moderation affordances render based on the
    signed-in user's actual role/permissions (`chat:read`, `chat:write`,
    `chat:moderate`, pin eligibility for admin/operations + field managers
    + IBO levels 1–4), not a client-side toggle.
  - DECIDED: the interactive toggle does NOT ship. In its place render a
    single static, non-interactive role chip in the same pill styling and
    masthead position (active/lime state only), labeled with the signed-in
    user's real role group (e.g. `Rep` / `Manager` / `Admin`) — the visual
    affordance survives, the fake mode-switching does not.
- **Real channels, not mockup fixtures.** The four mockup channels (All
  Company / New Reps / Training Updates / Managers with hardcoded counts,
  descriptions, member counts, unread counts) are demo data. Render the
  real channels from `useChatChannels` (Firestore `chatChannels` where
  `memberIds array-contains` current uid and `active == true`, sorted by
  `order`), configured via the existing admin page
  `src/app/portal/admin/chat-channels/page.tsx` and
  `/api/portal/chat/channels/manage`. Do not hardcode the mockup's demo
  IDs, counts, unread values, or member counts (extraction B "Most
  important implementation constraints" #7).
- **Real messages via existing realtime flow.** Keep `useMessages`
  (Firestore `chatChannels/{channelId}/messages`, `orderBy createdAt desc`,
  `limit 75`, filtered/reversed) as the message source — do not replace
  with polling or the unused GET `/api/portal/chat/messages` route. Keep
  the full existing send/edit/delete/reply/pin/reaction flow exactly as
  implemented: optimistic local echo on send with `(authorId, text)`
  reconciliation, failed-send retry/discard, author-only edit (PATCH
  `/api/portal/chat/messages`), delete (own message, or admin/operations
  via `chat:moderate`, soft-delete via `deletedAt`/`deletedBy`), pin/unpin
  (POST `/api/portal/chat/messages/pin`, admin/operations + field managers
  + IBO levels), reactions (optimistic overlay, POST
  `/api/portal/chat/reactions`, allowed set from `src/lib/chat/reactions.ts`).
- **Real attachments/GIFs, not mockup placeholders.** The mockup's
  "Image attachment / install confirmation placeholder" diagonal pattern
  and static "GIF … Reaction clip / placeholder" box are prototype
  fixtures. Render real uploaded images (via existing
  `attachmentUpload.ts` → `/api/portal/chat/media`, PNG/JPEG/WebP/GIF up to
  10MB, downscaled >2000px long edge to JPEG q.85, stored at
  `chat/{channelId}/{uuid}.{ext}`) and real GIFs (via existing `GifPicker`
  → `/api/portal/chat/gifs`, GIPHY-hosted, button conditional on
  `GIPHY_API_KEY`) inside the mockup's visual frame (same dimensions/
  border treatment where an image/GIF is present), preserving dimensions to
  avoid layout shift. Route image click-through through the existing
  `ChatLightbox` (portaled, scroll-locked, Escape-before-Radix-sheet,
  focus-trapped) — it is shared with sales proof and onboarding upload
  flows, so restyle in place, do not fork it.
- **`LIVE` presence label**: the mockup's green dot + `LIVE` text is purely
  decorative in the prototype (extraction Part A/B — chat currently renders
  no presence data; `usePresenceHeartbeat` only powers admin user-table
  dots via a 3-minute freshness window on `users/{uid}.lastActiveAt`). Keep
  the visual element but either wire it to a real per-channel-member
  online signal derived from the existing presence heartbeat data, or, if
  that's out of scope for this slice, render it as a static "live channel"
  indicator without implying per-user online status the app doesn't yet
  compute — do not fabricate a member-online count.
- **Unread counts/dots**: use the real `useChatUnread` logic (`users/{uid}/
  chatReads`, `lastMessageAt > lastReadAt`, fail-closed while loading,
  current channel marked read on open then throttled ~2s, mobile marks read
  only once the conversation view is actually open) — not the mockup's
  static per-channel unread numbers.
- **Mobile bottom-nav unread dot**: unchanged — the shared `portalNavGroups`
  → `MobileBottomNav` global chat-unread dot logic stays as-is; this slice
  does not touch notification-bell coupling (chat has no
  `NotificationType` entry today per extraction B, and that remains true).
- **Stale copy**: remove/revise any lingering "text-only / no media
  hosting" description text if the redesigned page surfaces the existing
  image/GIF capability (extraction B constraint #8) — don't ship copy that
  contradicts what the UI now visibly supports.
- **Reaction emoji set**: keep the real allowed-reactions list from
  `src/lib/chat/reactions.ts`; the mockup's specific demo emoji (check,
  pushpin, clap, fire, party popper, flexed bicep, thumbs-up, lightbulb,
  books) are illustrative, not a spec to hardcode.
- **Managers-channel role predicate**: unchanged from today (`l1_manager`,
  `l2_manager`, `ibo_level_1`–`ibo_level_4`, plus admin/operations org-wide
  access); `general_manager`/`office_manager`/`gm_in_training` are NOT
  auto-included per current behavior (extraction B nuance) — do not expand
  this predicate as part of a visual redesign.
- Empty/loading states: geometry-true skeletons for channel rows and
  message rows (campaign pattern), not the mockup's always-populated demo
  state.
- **Avatars (round-1 ruling)**: real user photos may render when a user
  has one (real-data rule), but the initials fallback must use the
  mockup's treatment — lime-outline circle, panel background, lime
  monospace initials — NOT per-user filled colors. Own-message avatar
  keeps the lime fill per mockup.
- **DEV badge (round-1 ruling)**: the pre-existing DEV+role double badge
  on developer-authored messages is sanctioned real behavior.
- **Info-sheet trigger (round-1 ruling)**: the mockup shows no chevron
  or "#" glyph beside conversation titles. The ChannelInfoSheet opens by
  tapping the title/head block itself (pointer cursor, aria-label) — no
  added glyphs on desktop or mobile.
- **Add-reaction control (round-1 ruling)**: no persistent smiley under
  reaction-less messages. Reaction chips render only when reactions
  exist; adding a reaction happens via hover-reveal on desktop and the
  message actions sheet on mobile.
- **Composer placeholder** uses the mockup copy `Broadcast an update…`.
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent).
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base`); the mockup's own
  reduced-motion mode disabling scroll/animation is consistent with this.
- No route changes, no new APIs, no Firestore/data-shape changes
  (ANCHOR.md §1/§2). `/portal/chat` stays in `portalNavGroups`,
  `PortalSidebar`, `MobileBottomNav`, and `CommandPalette` exactly as today.

## CRITICAL preservation: mobile bottom-nav shell hook

The current page sets `document.body.dataset.chatThread = 'on'`
(`src/app/portal/chat/page.tsx:495`) when the mobile conversation view is
open, and clears it when returning to the channel list. `globals.css:400`
uses that attribute to hide the mobile bottom nav and zero its bottom
padding while a thread is open:

```css
body[data-chat-thread] [data-slot="mobile-bottom-nav"] {
  display: none;
}
body[data-chat-thread][data-portal-bottom-nav] .portal-scope main {
  padding-bottom: 0;
}
```

The redesigned page MUST set and clear `body[data-chat-thread]` at exactly
the same transitions (entering/leaving the mobile conversation view) using
the exact same attribute name and the exact same `data-slot="mobile-bottom-
nav"` target selector. This is also called out in `shell-the-rail-goal.md`
("chat thread hides bar" regression check) — the Rail shell
(`PortalHeader`/`PortalSidebar`/`MobileBottomNav`) itself is not edited by
this slice; the hook is driven entirely from the chat page/components.

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** Any large gradient/metallic numeral
   (background-clip:text) this page introduces MUST use the shared
   `.portal-metallic-num` class from `globals.css` (padding
   `.25em .13em 0 0` + matching negative margins; mobile ≤460px drops
   right padding). Chat has few numerals (mainly channel numeral badges,
   which are small monospace, not metallic-clip) — verify step MUST still
   screenshot the display titles (which use the metallic gradient at
   large sizes) at 1440 AND 390 and confirm no glyph is chopped on any
   edge. This is a user-mandated rule — numbers have been repeatedly cut
   off on this campaign.
2. **Zero `page.tsx` edits outside the chat route.** Touch only
   `src/app/portal/chat/**` and the chat components dir
   `src/components/chat/**` (`MobileChannelList.tsx`, `MobileThread.tsx`,
   `MessageActions.tsx`, `ReactionBar.tsx`, `ChannelInfoSheet.tsx`,
   `ChatLightbox.tsx`, `attachmentUpload.ts`, `GifPicker.tsx`,
   `ChatAvatar.tsx`), plus `chat-line-*` styles added to `globals.css`. No
   edits to `src/hooks/chat/**` (`useMessages`, `useChatChannels`,
   `useChatUnread`) or `src/lib/chat/**` (`channels.ts`, `access.ts`,
   `reactions.ts`, `media.ts`) unless a sanctioned deviation above
   explicitly requires it — this is a visual reskin, not a data/behavior
   change. `ChatLightbox.tsx` is shared with sales proof and onboarding
   upload flows (extraction B) — restyle carefully, do not change its
   public behavior. The Rail (shell: `PortalHeader`, `PortalSidebar`,
   `MobileBottomNav`, portal `layout.tsx`) is otherwise untouched — do not
   duplicate or re-mount shell chrome, and do not touch the admin
   `chat-channels` page.
3. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`.
4. **Dark theme via `localStorage['3c-theme']`.** Both themes must render
   correctly; dark is the 1:1-verified target.
5. **Respect the reduced-motion exemption pattern** in `globals.css`
   `@layer base` (see `project-reduced-motion-gotcha` memory — Windows
   reduce-motion freezes all animations unless exempted correctly; test
   against the full compiled CSS, not source).

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on :3000, dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory):
   if computed styles don't match source, kill the node child on :3000,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation covering: desktop channel list +
   conversation pane at 1440px, mobile channel list view at 390px, mobile
   thread/conversation view at 390px (confirm the bottom nav is HIDDEN
   there via `body[data-chat-thread]` and reappears on returning to the
   list), composer focus state (lime border), and an image attachment sent
   + opened in `ChatLightbox` if feasible in the verify session.
4. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/chat-round1/option-3-the-line-chat.html` (rendered) and
   this contract's sanctioned-deviations list; every visual difference not
   on the sanctioned list is a defect. Numeral-clipping check (Hard Rule 1)
   is explicit in every round.
5. Also verify no regressions: `body[data-chat-thread]` still hides
   `MobileBottomNav` exactly as today and restores padding on exit; realtime
   send/edit/delete/reply/pin/reaction flows still work end-to-end; unread
   dots (channel rail + mobile bottom nav) still reflect real
   `useChatUnread` state; `ChatLightbox` still works correctly for sales
   proof and onboarding upload callers (not just chat); admin
   `chat-channels` page and its link from `ChannelInfoSheet` still work
   unchanged.
6. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
   diffs, zero clipped numerals, zero broken entry points/regressions).
   Commit locally only. Push only on the user's explicit "deploy".
