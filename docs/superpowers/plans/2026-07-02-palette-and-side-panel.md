# Command Palette + Sale Side Panel

Two features on top of the shipped redesign. Global constraints: match the
locked design system (docs/redesign/ANCHOR.md §3-4: navy #0A1F44 / lime
#8dc63f discipline, dark-mode variants on every light-only class, portal-enter
motion, tabular numerals); zero new dependencies; zero changes to routes, API
contracts, hooks logic, or permission gating; every existing function
preserved.

## Task 1 — Command palette with subtle search trigger

Files (exclusive ownership): NEW `src/components/portal/CommandPalette.tsx`;
EDIT `src/components/portal/PortalHeader.tsx`.

Trigger (subtle, per client): in PortalHeader's right cluster before the bell.
Desktop (`sm+`): quiet pill — `h-9 rounded-md border border-slate-200
bg-slate-50 px-3 flex items-center gap-2 text-sm text-slate-500` (+ dark:
variants), containing a `Search` icon (size-4), the word "Search", and a
`<kbd>` "Ctrl K" hint (hidden below `md`). Mobile (< sm): icon-only button
styled exactly like the bell button, aria-label "Search". Both open the
palette. Global Ctrl+K / ⌘K toggles it; the listener lives in the palette
component (mounted by PortalHeader so it exists on every portal page).

Palette: fixed inset-0 z-50 dialog. Backdrop `bg-black/40` click-to-close.
Panel: `mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-lg rounded-lg border
border-white/10 bg-[#0A1F44]/90 backdrop-blur-md shadow-2xl text-white` —
the design system's one sanctioned glass moment. Input row: Search icon +
borderless transparent input (`text-white placeholder:text-white/40`,
autofocus) + "esc" hint. Results `max-h-[50vh] overflow-y-auto`, grouped
under 11px uppercase `text-white/40` section headers.

Content, permission-aware via useAuth (mirror PortalSidebar's gating):
- Pages: every sidebar destination the user can access (Dashboard, Team Chat,
  Leaderboard, Sales, Calls, My Onboarding, the 5 forms, University, Links,
  Pay Structure, plus ops/admin items the role allows).
- Actions: "Log a sale" → /portal/sales/new (sales:write), "Review pending
  sales" → /portal/approvals (sales:approve), "Report a bug" →
  /portal/settings#report-bug.
- Sales (only if sales:read): fetched once on open using the exact fetch
  pattern of src/hooks/useSales (inspect it; include requestedBy etc.), max
  ~50; shown only when query length ≥ 2; match on customerName /
  customerAddress / customerPhone; row shows name + status; Enter/click →
  /portal/sales/{id}.

Behavior: case-insensitive substring filter on labels; empty query = pages +
actions only. ArrowUp/Down moves an active row across the flattened visible
results (hover also sets it); Enter router.push()es and closes; Esc closes;
body scroll locked while open. Active row: `bg-white/10` + 2px lime left bar
(the only lime). Empty result state: one muted line "Nothing matches — try a
customer name or page." role="dialog" aria-modal="true".

## Task 2 — Sale detail side panel

Files (exclusive ownership): NEW `src/components/sales/SaleDetailSheet.tsx`;
EDIT `src/components/sales/SalesTable.tsx`.

Interaction: clicking a sale row (desktop) or card (mobile) opens a right-side
Sheet (use existing src/components/ui/sheet.tsx) for that sale; rows get
cursor-pointer. Clicks on action buttons inside rows must NOT open the sheet
(stopPropagation). The existing "View" eye icon keeps navigating to the full
page (title "Open full page").

Sheet (sm:max-w-[480px]): header = customer name (text-lg font-semibold) +
status Badge (reuse statusVariant map) + pending-age chip (reuse PendingAge);
below, a portal-num "N of M" position indicator plus prev/next chevron
buttons. Body: labeled sections using the 11-12px uppercase muted label style
— Rep (initials chip + name), Sale date, Value and Commission (right-aligned
tabular, commission in the green used by the table), Phone/Address when
present, notes/rejection reason when present (inspect the Sale type in
src/types and render what exists; omit empty fields). Footer: for pending +
canApprove — Approve button (same lime style) calling the SAME handler the
table uses, and Reject opening the SAME existing reject dialog; for admin —
Edit (link to /portal/sales/{id}/edit) and Delete via the SAME existing
delete-confirm dialog; always — "Open full page" ghost link with
ArrowUpRight → /portal/sales/{id}.

Navigation: prev/next chevrons + ArrowUp/ArrowDown and j/k while the sheet is
open step through the currently rendered (filtered) sales order; disabled at
the ends (no wrap). If the open sale disappears from the list (e.g. approved
away under a Pending filter), close the sheet gracefully.

Implementation: the Sheet is rendered inside SalesTable (so it shares the
approve/reject/delete handlers and dialogs already there); selected state =
sale id + derived index. Zero changes to useSales, APIs, or routes. Dark
variants on everything; no lime beyond approve button/status tints.

## Task 3 — Mobile chat: Connecteam-style two-screen layout

Client decisions (2026-07-02): two screens on phones (channel list → tap into
full-screen conversation with back arrow), chat-bubble messages on phones,
bottom nav visible on the list screen but hidden inside a conversation.
DESKTOP (lg+) STAYS EXACTLY AS IT IS — side-by-side panel layout, card-style
messages, band header. All changes are mobile-only presentation.

Files (exclusive ownership): EDIT `src/app/portal/chat/page.tsx`,
`src/components/portal/MobileBottomNav.tsx`, `src/app/globals.css` (only the
bottom-nav visibility rules); NEW components under `src/components/chat/` as
needed (e.g. MobileChannelList.tsx, MobileThread.tsx).

Mobile (< lg) behavior:
- Local view state: 'list' | 'thread' (default list; entering a channel sets
  thread; back arrow returns to list). Desktop ignores this state entirely.
- LIST SCREEN: the big navy band is HIDDEN on mobile (it eats half the
  screen — the client's core complaint); instead a compact title row ("Team
  Chat", portal-display, ~text-xl) then full-width tappable channel rows:
  # / lock icon, channel name (semibold), audience chip, one-line truncated
  description, right chevron. Rows are the standard card/divider style with
  dark variants. Bottom nav remains visible here.
- THREAD SCREEN: compact sticky top bar — ChevronLeft back button (≥40px
  target), channel name, audience chip. Messages fill the remaining height,
  newest at bottom (keep existing scroll-to-bottom behavior). Composer pinned
  to the bottom edge (sticky), Enter-to-send + Shift+Enter preserved, the PII
  helper line may shrink to one short line. Bottom nav hidden on this screen.
- BUBBLES (mobile only): own messages right-aligned in navy `#0A1F44` bubbles
  with white text; others left-aligned in white/card bubbles with the author
  name + role chip above and timestamp small below; rounded-2xl except the
  anchored corner (rounded-br-md for own / rounded-bl-md for others).
  ReactionBar renders under each bubble aligned to its side. Delete stays
  reachable on mobile: small muted trash icon beside own/moderatable bubbles
  (same handler, same confirm-free behavior as today). Dark variants for all.
- Bottom-nav mechanics: MobileBottomNav currently returns null on
  /portal/chat — change it to render on chat too; the chat page marks
  `document.body.dataset.chatThread = 'on'` while (and only while) the mobile
  thread view is active (clean up on leave/unmount); globals.css hides the
  bottom nav and drops its reserved padding when that flag is present. Give
  the nav element a stable hook (e.g. data-slot="mobile-bottom-nav") for the
  CSS.

HARD RULES: zero changes to hooks (useChatChannels/useMessages), APIs,
routes, permissions, or desktop chat markup/behavior (the lg+ layout must be
pixel-identical — verify by keeping the existing JSX for lg+). No new
dependencies. No per-channel last-message preview (that would need new data
reads) — the description line stands in for it.

## Verification (each task)

`npx eslint <owned files>` clean; controller runs tsc/build; functional
preservation is the review's hard gate.
