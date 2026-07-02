# Team Chat Feature Backlog

> Produced 2026-07-02 by a 4-agent research sweep (Connecteam anatomy, table-stakes
> features, mobile chat UI specs). The one-stop map so chat features stop being
> discovered one at a time. Constraints honored: text-only, no media hosting, no
> paid vendor, Firebase free-tier budgets.

## 1. ALREADY COVERED

| Research item | Status in current build |
|---|---|
| Realtime channels with audience gating | Shipped — realtime channels w/ audience gating |
| Fixed-set reactions | Shipped — reactions |
| Own/moderator delete | Shipped — delete |
| Admin channel management | Shipped — admin channel management |
| Enter-to-send (desktop) | Shipped — Enter-to-send |
| Desktop split-pane layout | Shipped — desktop split-pane |
| Mobile two-screen + bubbles, author name/role on others' messages | Shipped — mobile two-screen with bubbles + author name/role |
| Bounded read window | Shipped — 75-msg windows |
| Long-press action menu (reactions + delete) — *backing actions* | Backing actions shipped in Slice 1; only the mobile long-press *presentation layer* remains (see BUILD NOW) |
| Static role chip (substitute for presence/work-status) | Shipped — role shown on others' messages |

---

## 2. BUILD NOW — visual-only / trivial-data quick wins

*All client-side over the 75 messages already loaded; no new Firestore reads/writes. Ordered by field-team value.*

- **Consecutive-message grouping (5-min window).** Merge same-author messages when the gap is <5 min and no day change: render the name + role chip only on the first bubble, suppress it on the rest, and tighten vertical spacing (~2px in-group vs ~8–12px between). This is the single biggest "feels clean" win and removes the current repeated-name noise on mobile. *(hours)*

- **Deterministic author color + initials monogram.** Hash the user id → stable color, render a circular initials chip on others' first-in-group bubble (own messages stay right-aligned, no chip). Gives ~80% of the Connecteam avatar recognition benefit with zero storage or PII. Pairs directly with grouping. *(hours)*

- **Day separators (Today / Yesterday / weekday / date).** Inject a centered date pill whenever the calendar day changes across the loaded messages: "Today", "Yesterday", weekday for the last 7 days, full date beyond. Lets intermittent reps see where they left off without per-bubble timestamps. *(hours)*

- **Timestamp condensation + tap-to-reveal.** Stop stamping every bubble; show one short local time ("2:14 PM") on the last bubble of each group, and reveal exact time on tap of any bubble. Uses the `createdAt` already stored; drops the most repetitive visual noise on a narrow screen. *(hours)*

- **Clickable links (linkification).** Auto-detect URLs in message text and render as safe tappable links (`target=_blank`, `rel=noopener`). No preview cards (those need media hosting). Reps paste scheduling/training links constantly — non-clickable URLs mean copy-paste pain on a phone. *(hours)*

- **Scroll: auto-scroll only when pinned to bottom.** Track an invisible bottom anchor (~150px) via IntersectionObserver; auto-scroll new messages only when the user is pinned to bottom, otherwise hold their position. Fixes the most common and most infuriating chat-scroll bug. *(day)*

- **Jump-to-latest pill with new-message count.** Floating "N new messages ↓" button shown only while scrolled up, counting arrivals; tap scrolls to bottom (later, to the unread divider). One-thumb return to live without the app yanking them. *(hours)*

- **Long-press action menu (mobile presentation).** Wire a ~450ms long-press on a bubble to raise the existing reaction row + delete (own/moderator). Backing actions already ship; touch has no hover, so these controls are currently unreachable on mobile. *(days)*

- **Optimistic send + pending/failed state.** Append the bubble immediately at reduced opacity, clear when `metadata.hasPendingWrites` flips false, and surface a "failed — tap to retry" affordance. Firestore already queues offline writes; this is UI state only. Real trust anchor for reps on weak signal. *(day)*

- **Auto-growing composer glued above the keyboard.** Textarea grows to ~5 lines then scrolls; use `visualViewport` to keep it pinned above the on-screen keyboard and preserve scroll position. On mobile, Enter = newline and a dedicated send button posts. This is the fiddliest part of feeling native vs. "a webpage." *(days)*

- **Sticky floating date header.** During long back-scrolls, stick the current day label to the top of the pane and update it across day boundaries. Complements the inline separators. *(hours)*

---

## 3. BUILD NEXT — needs real data-model work

*Ordered by field-team value. Each notes the data required.*

- **Push notifications for new messages.** *Data:* fan-out from the existing message POST route to stored Web Push (VAPID) subscriptions — pipeline already built and dormant, no vendor or Cloud Function needed. *Caveat:* iOS only delivers when installed as a PWA. Highest-value item: without push, chat is a dead inbox for a phone-first team. *(days)*

- **Per-channel unread state.** *Data:* a per-user, per-channel `lastReadAt` pointer (one small write on channel open), compared against the channel's last-message time. Ship the boolean **unread dot** first (cheap); exact counts cost reads per channel per open and strain the 50K/day ceiling. Feeds the sidebar badge, the in-thread **unread divider line**, and the jump-pill target. #1 thing a returning rep looks for. *(day–days)*

- **Channel list sorted by last activity + last-message preview.** *Data:* a denormalized `lastMessage {text, author, ts}` on each channel doc, written once per send (cheap, bounded). Makes the channel home screen scannable and floats active channels to the top. *(day)*

- **Pinned messages.** *Data:* a small pinned list/flag per channel, rendered in a bar above the live feed. With only the latest 75 loaded, today's Zoom link/schedule literally scrolls out of existence — pinning is the only way key info survives the window. High value, low cost. *(day)*

- **@mentions.** *Data:* member-directory autocomplete (memberIds already exist), stored mention ids on the message, highlight rendering, and a hook into the push path. "@J respond by 5" must actually reach that rep. In-portal highlight works now; guaranteed alert rides on push above. *(days)*

- **Mute per channel.** *Data:* a per-user muted-channel list checked by push fan-out and badge logic. The valve that makes aggressive push tolerable — mute and push only work as a pair. Pin/mark-unread can share the same quick-action menu. *(day)*

- **Reply / quote-to-message.** *Data:* a denormalized `replyTo` snippet (author + text excerpt) stored on the message so it survives even after the parent scrolls past the 75-window; rendering is client-side. Keeps fast channels coherent; already expected from WhatsApp/Connecteam. *(day)*

- **Message editing.** *Data:* an `editedAt` field + a server route to mutate text; the existing `onSnapshot` reflects it instantly. No edit history. Fixing a wrong time in a broadcast without a noisy correction message reads as basic. *(day)*

---

## 4. SKIP FOR THE PILOT — conflicts with firm constraints

- **Per-message read receipts / "seen by"** — O(members × messages) writes blows the free-tier budget; and channel read receipts aren't even expected (Slack/Teams don't show them). The per-channel `lastReadAt` is the affordable substitute.
- **Typing indicators** — per-keystroke ephemeral writes re-read by every listener; fastest way to blow the 20K-write / 50K-read ceiling. Belongs on Realtime DB (extra infra).
- **Live presence / "last seen" + work-status** — frequent heartbeat writes are a free-tier budget killer, and work-status assumes time-clock data we don't have. Static role chip already covers the need.
- **Rich media composer (attachments, GIFs, voice, location)** — directly forbidden by the no-media-hosting / text-only / no-PII constraints.
- **Deep chat-history search** — Firestore has no full-text search; full-history loading blows the read budget and an external index is a paid vendor. Ship shallow in-view search over the loaded 75 instead, and set expectations that it isn't deep history search.
