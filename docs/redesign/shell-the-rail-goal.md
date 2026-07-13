# Shell "The Rail" — Visual Parity Goal Contract

User picked shell mockup Option 1 "The Rail" (2026-07-13, commit 0521283) for
the ENTIRE portal shell: header, sidebar, mobile bottom bar, mobile full-nav
sheet. Same contract style as `dashboard-the-line-goal.md`: implementation is
verified 1:1 against reference screenshots by independent reviewers until
EXACT — not close enough.

## Source of truth

- Mockup: `design-mockups/shell-round1/option-1-the-rail.html`
- Reference screenshots (repo root): `shell-opt1-1440.png` (expanded rail,
  desktop), `shell-opt1-390.png` (mobile w/ bottom bar)
- The mockup's MAIN CONTENT AREA (hero, block grid, "Today on the floor") is
  a placeholder and does NOT ship. Only the shell chrome is in scope:
  header, sidebar (expanded + collapsed), bottom bar, sheet, backdrop.

## Scope of change (swap in place — no page file churn)

Reimplement the INTERNALS of `PortalHeader.tsx`, `PortalSidebar.tsx`,
`MobileBottomNav.tsx` (and their CSS) so every existing mount keeps working
unchanged. Component names, exports, and context contracts stay:
- `MobileMenuContext` still drives mobile nav (now the bottom sheet, not a
  left drawer).
- `body[data-portal-bottom-nav]` and `body[data-chat-thread]` hooks keep
  working exactly as today (globals.css reserves space; chat thread hides bar).
- `usePresenceHeartbeat`, `useNotifications`, `usePendingSignupsCount`,
  `useAuth`/`hasPermission`/`isRole`, `AuthContext.signOut` all stay wired.
- No route changes, no new APIs, no page.tsx edits (the ~19 direct shell
  mounts + 2 layouts must render the new shell with zero duplicate chrome).

## Composition — desktop (1440)

1. Fixed header, 72px: real 3C logo (NEW RULE: real logo asset, not the "3C"
   placeholder square) + "3C World Group / Employee Portal" brand block left;
   search trigger ("Search the portal · Ctrl K", 340px max) center-right;
   notification bell w/ lime badge; avatar (lime ring) + name/role + menu
   (Settings / Report a Bug / Sign Out). Background rgba(3,9,22,.95), blur,
   1px hairline bottom border.
2. Fixed left sidebar under header: 240px expanded, 66px collapsed icon rail,
   220ms ease-out. "Navigation / rail" mono kicker + collapse control on top;
   grouped nav; "Back to Main Site" footer pinned bottom with top hairline.
   Background: vertical navy gradient rgba(10,31,68,.97)→rgba(3,9,22,.98),
   1px right hairline.
3. Nav items: 35px min height, icon + label, active = 2px lime left rail
   (6px inset) + lime icon + white text + soft bg. Collapsed: icons centered,
   labels/badges/footer text hidden, collapse icon rotated 180°.
4. Main content offset by current sidebar width; transition matches.
5. Design tokens exactly per mockup: --stage #030916, --panel #0a1f44,
   --lime #a3e635, --line rgba(229,238,246,.15), hairlines everywhere,
   square corners (pills/avatar only rounded), mono uppercase 9–11px kickers
   at .08–.18em tracking, lime focus outline 2px offset 3px.

## Composition — mobile (≤800px equivalent breakpoint; keep lg where Tailwind demands)

1. Header 62px: icon-only search, brand subtitle hidden, NO hamburger (the
   old left drawer is DELETED — mobile nav lives in the bottom bar + sheet).
2. Fixed bottom bar, 68px, 5 equal slots with top hairline + soft dividers:
   Dashboard · Sales · Team Chat · Leaderboard · More. Active slot from
   pathname (lime icon + label). Chat keeps its lime unread dot. Slots keep
   today's permission gating (sales:read, chat:read, leaderboard:read).
3. "More" opens the full-nav bottom sheet: dark backdrop, sheet max 83vh,
   lime top border + drag handle, kicker "The Rail / full navigation",
   title "More of the portal", Close button, SAME grouped role-filtered nav
   as desktop, "Back to Main Site" footer. Closes via Close, backdrop tap,
   Escape. Link tap navigates and closes.

## Navigation content (REAL routes + REAL gating — not the mockup's demo set)

One nav config array is the single source of truth, consumed by sidebar,
bottom sheet, AND CommandPalette (kills today's palette drift; palette keeps
its action entries). Groups and order:

- (no heading): Dashboard, Sales, Team Chat, Calls Schedule, Leaderboard,
  My Onboarding (entry_level_rep only) — current gates preserved.
- Forms: today's 5 form links (Fiber Report, Expedite Order, Payroll Dispute,
  Leads Request, Manager Interview w/ its role list). TRANSITIONAL: collapses
  to the single "Forms" hub link when the Forms page ships.
- Resources: University, Links, Pay Structure — current gates.
- Operations (current role list incl. field managers): the 12 current items
  incl. Pending Approvals (TRANSITIONAL: Approvals folds into Sales later).
- Admin (admin only): User Management (live pending-signups badge),
  Form Options, Chat Channels, System Settings.

Groups in the sidebar are section-labeled like the mockup. Collapsible
sections and their localStorage keys (3c-nav-*) are RETIRED — The Rail shows
groups flat; the collapse control collapses the whole rail instead, state
persisted in localStorage `3c-rail-collapsed` (sanctioned improvement over
the mockup, which didn't persist).

## Sanctioned deviations from the mockup

- Real 3C logo asset replaces the "3C" square (campaign rule).
- Real data/gating: no Rep/Manager/Admin demo switch, no demo toasts, no
  fake badges (Forms "5" badge does NOT ship — no live source yet; User
  Management badge + chat dot are the only live indicators).
- Search opens the real CommandPalette (mockup only toasted); Ctrl/Cmd+K kept.
- Notification bell opens the real notifications dropdown with mark-read /
  mark-all / clear-all (mockup was static).
- Bottom bar slot 4 = Leaderboard until the Forms hub exists (mockup showed
  Forms); label "Leaderboard" may truncate to "Board" as today.
- Collapsed rail gets `title` attributes on links (mockup had none; a11y).
- Escape/backdrop close + body scroll lock on the sheet; focus returns to
  the More button (a11y hardening beyond mockup).
- Light theme keeps working via ThemeContext: header themes as today; the
  rail + bottom bar stay dark navy in both themes (dark is the 1:1 target).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent).
- prefers-reduced-motion disables the rail transition.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint,
   `npm run build`, `git diff --check`.
2. Signed-in Playwright on :3000, dark (`localStorage['3c-theme']='dark'`).
3. Screenshots: 1440 expanded rail + 1440 collapsed rail + 390 dashboard w/
   bottom bar + 390 sheet open — on /portal/dashboard (old dashboard content
   is fine; only shell chrome is judged). Fresh Opus reviewer diffs shell
   chrome vs `shell-opt1-1440.png` / `shell-opt1-390.png`; every shell-chrome
   difference not on the sanctioned list is a defect.
4. Also verify NO regressions: chat thread still hides the bottom bar; no
   duplicate shells on admin pages; palette opens; sign-out works; bottom
   padding reserved under bar.
5. Codex fixes; repeat with a FRESH reviewer until PASS. Push only on the
   user's explicit "deploy".
