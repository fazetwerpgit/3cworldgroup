# Rainbow Developer Name in Chat — Design

Status: approved by Jacob 2026-07-12.

## Goal

Jacob (the portal's maker) wants his name in the portal chat to render as an
animated rainbow gradient — the "CoD Black Ops 2 hacked lobby" look — with a
small **DEV** badge next to it. Visible to everyone, on desktop and mobile,
light and dark mode.

## Scope / decisions

- Tied to Jacob's **account UID** (`bQWKezQmd1P9Yf3GzOdXXBkDzj93`), NOT the
  admin role. Other admins keep their normal author colors. Renaming an
  account "Jacob" does not trigger it.
- Purely presentational — no changes to message storage, sending, or Firestore.
- Applies everywhere the author name renders in chat:
  - Desktop chat page message header (`src/app/portal/chat/page.tsx`)
  - Desktop reply-preview author + "Replying to X" composer chip
  - Mobile thread message header + reply preview + "Replying to X"
    (`src/components/chat/MobileThread.tsx`)
- `prefers-reduced-motion`: static rainbow gradient (no animation).

## Implementation shape

1. `src/lib/chat/authorColor.ts`: export `DEVELOPER_UID` constant and
   `isDeveloperAuthor(authorId)` helper.
2. `src/app/globals.css`: `.chat-dev-name` — animated rainbow gradient text
   (background-clip: text, oversized gradient, keyframed background-position,
   ~3s linear infinite); `.chat-dev-badge` — small "DEV" pill with animated
   rainbow border/tint; `@media (prefers-reduced-motion: reduce)` freezes both.
   Colors chosen to stay readable on both light and dark chat surfaces.
3. Render sites: when `isDeveloperAuthor(message.authorId)`, swap the normal
   color-var span for the rainbow class and append the DEV badge after the
   name (before the role badge).

## Out of scope

- Other portal surfaces (leaderboard, member lists, avatars) — chat only.
- Per-user unlockable name styles.
