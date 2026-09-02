# Portal UX sweep fixes — design (2026-09-02)

Source: the "Portal UX Sweep" report (phone-first audit of all 11 rep + 16 admin pages). Jacob approved fixing everything in it, plus two additions: (a) "text isn't straight" (see §2), (b) dark mode is the default on phones.

Reps are all on modern iPhones. Phone is the primary target; desktop must not regress.

## 1. One page header everywhere

`src/components/portal/PageTitle.tsx` (+ `src/styles/page-title.css`) replaces every per-page slogan masthead. Props: `title`, `meta`, `subtitle?`, `actions?`, `back?`.

Rules for every rep and admin page:
- Title is the plain page name a rep would say: Dashboard, Sales, Calls, Forms, Resources, University, Settings, Team Chat, Leaderboard; admin: Ops Home, Recruiting Pipeline, Recruiting, Manager Interviews, Onboarding Review, University Content, Fiber Reports, Expedite Orders, Payroll Disputes, Leads Requests, Email Templates, Bug Reports, User Management, Form Options, Chat Channels, System Settings. Same names as the nav (`portalNavGroups` in CommandPalette.tsx). Dashboard keeps its greeting as the title ("Good evening, Jacob").
- `meta` carries the live number that used to be the decorative digit: "0 sales this month", "6 waiting", "18 members".
- Delete: eyebrow lines ("03 / THE LINE / …", "ON AIR OPS SIGNAL / …", "QUEUE / LIVE", "LIVE / OPS SIGNAL"), slogan headlines ("KEEP THE SIGNAL. MOVE THE WORK."), explanatory paragraphs, decorative gradient digits and their captions, in-page breadcrumbs ("3C WORLD GROUP / THE LINE / SALES"), and footer taglines ("Open the lane. Leave the signal clear.").
- Section headings inside a page stay, but lose their numbering (01/02/03) and eyebrow pairs unless the items are a true sequence. Right-aligned mono captions that wrap on phone ("REP VIEW · 2 ITEMS", "5 FORMS READY TO OPEN", "WEDNESDAY SELECTED") become a single short line under/next to the heading, left-aligned on phone.
- Copy rule: every sentence must be something you'd say to a rep out loud. Remove design-language ("signal", "the line", "broadcast", "lane", "floor", "ledger", "masthead", "rail") from user-visible text. Existing empty states like "Call schedule not published yet." are the target tone.

## 2. "Text isn't straight" = fallback fonts and mixed faces

Jacob's example: the "0 SALES ON THE BOARD." heading looks slanted. There is no italic/skew in CSS; the cause is Windows-only font stacks (`"Arial Narrow", "Bahnschrift Condensed", "Trebuchet MS"`, `Courier New`, `Georgia`) that fall back to different faces on iPhone, plus faux-bold/condensed synthesis and heavy negative letter-spacing. Fix:
- All display headings use `var(--font-archivo), var(--font-sans), Arial, sans-serif` (Archivo is already loaded in the portal layout). PageTitle does this.
- `--member-line-sans` → `var(--font-sans), system-ui, sans-serif`; `--member-line-serif` → same as sans (no serif display in the portal); `--member-line-mono` → `ui-monospace, "SF Mono", Menlo, monospace`, and mono is used only for true codes/IDs, never for descriptions or buttons.
- Remove `letter-spacing` below `-0.02em` on headings and any `transform: scale*/skew*` on text.

## 3. Prompts

- `PushPromptBanner` stops being a fixed overlay. It renders only on the dashboard, inline, directly under the stat cards, as a one-line card (bell icon, "Get chat and sale alerts on this phone", Turn on / Not now). "Not now" snoozes 30 days (`PUSH_PROMPT_SNOOZE_KEY` already exists; set the snooze window to 30d in `src/lib/push/pushPrompt.ts`).
- Add-to-home-screen banner (`AddToHomeScreenBanner`) shows only if the push prompt is not showing; only one prompt at a time, install first, notifications on the next visit.
- The header bell gets a small dot while push permission is still 'default' on a supported device (no new prompt, just the dot).

## 4. Specific page fixes

Rep:
- Leaderboard (phone): heading via PageTitle; period + metric filters become two segmented pill rows (44px tall targets); "LIVE" becomes a small green dot + "Live" label.
- Sales: footer totals get labels ("Sales", "Value", "Expected pay"); one empty state when there are no sales ("No sales yet. Log your first one." under the Log Sale button); the "Waiting on a decision" section renders only when there is something pending.
- Forms: each form is one tappable row (title + one-line description + chevron); no Open Form button; audience shown as a small chip only when it is not "everyone".
- Training: filter chips hidden until there are ≥ 4 items; Resources page links to University with one row instead of a nested masthead.
- Calls: week strip is 7 equal columns on phone (M T W T F S S with the date number), no eighth cell, no "0 CALLS" bars when unpublished.
- Settings: Report a bug is a single text link at the bottom of the page (remove the top button and the middle card); button "Save changes"; labels "Role", "Status", "Employee ID", "Member since"; pill "Q1 / L1 MANAGER / ACTIVE" removed; Change password card keeps its button with subtitle removed.
- Team Chat: mobile channel list keeps its cards minus the eyebrow/slogan; desktop: remove the scrolling ticker above the pinned message.
- My Onboarding: guard `data?.progress?.total` etc. in `src/app/portal/onboarding/page.tsx`; render "No onboarding items for your account." when there is no record.
- More drawer (`MobileBottomNav`): list only items NOT already on the bottom bar; Settings + Sign out at the bottom; title "Menu". Nav label "Calls" everywhere (nav, page title, dashboard button "Open today's calls" stays).
- Dashboard: greeting as PageTitle; keep stats + What's next; drop "PRIORITY ORDERED / NEXT ACTIONS" eyebrow and "REP VIEW · 2 ITEMS".

Admin (phone):
- Users, Pipeline: the whole row opens the person; Deactivate / Delete / Decommission move into the person detail view behind a confirm. Only "Assign role" (pending users) stays as a row button.
- Form Options: small inline "Add" and "Save" buttons (not full-width pills); nothing wraps.
- Recruiting: on phone, "New invite" button at the top opens/scrolls to the invite form.
- Every admin page: PageTitle + copy rule.

## 5. Dark mode default on phones

`ThemeContext`: when no theme is stored and `window.matchMedia('(max-width: 767px)').matches`, the initial theme is `'dark'` (not persisted, so the Settings segmented control still shows the three choices with Dark selected; choosing any option persists as before). Desktop default stays `'system'`.

## 6. Non-goals

No new features, no data model changes, no changes to the public site, no touching `globals.css` except the font variable block in §2 (all new CSS goes in `src/styles/*.css` imported by the component that uses it).

## 7. Gates

`npx tsc --noEmit`, `npx vitest run`, `npm run build`, then a phone + desktop screenshot pass of every page (same capture script as the audit) reviewed by Claude.
