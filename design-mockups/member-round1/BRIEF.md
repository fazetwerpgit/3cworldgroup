# Member Pages — Round 1 Mockup Brief

Build THREE self-contained HTML mockups (vanilla JS, zero external assets/fonts/CDNs)
in design-mockups/member-round1/:

- option-1-the-locker.html — practical, tools-first take
- option-2-the-ledger.html — calm, document/paper take
- option-3-the-line-member.html — "The Line" broadcast family take (dark Spotlight Arena)

Each file contains THREE VIEWS switched by a fixed pill nav (no page reloads):
Settings / Onboarding / Signup. Only one view visible at a time; default = Settings.

## Family design language (all three options are dark-first)

- Backgrounds deep navy/near-black (#030916-ish), lime accent (#a3e635-ish),
  metallic silver display numerals, mono uppercase kickers/labels, hairline rules.
- Big editorial masthead per view: lime first line + white second line display
  headline, short muted intro sentence, and a huge metallic count numeral at the
  right that is TOP-ALIGNED with the headline.
- Option 3 must feel like a sibling of the picked pages (numbered sections
  "01 / ...", broadcast index vibe). Options 1 and 2 same palette but different
  composition.

## HARD RULES (violations failed previous rounds — bake these in)

1. Metallic numeral uses background-clip:text. To avoid ink-chopping apply:
   `line-height:.78; padding:.25em .13em 0 0; margin:-.25em -.13em 0 0;`
   and a mobile override `@media(max-width:460px){ .display{padding-right:0;margin-right:0} }`.
2. Counts are PLAIN numbers — never leading zeros (8, not 08) — in numerals and stats.
   (Section labels like "01 / Who you are" in option-3 fill layouts are allowed.)
3. Mobile h1 size: `clamp(36px,10.5vw,54px)`. ZERO horizontal scroll at 390px
   (body scrollWidth must be <= viewport).
4. Fixed view-switch pill: desktop `top:72px; right:14px`, mobile `top:62px; right:9px;
   max-width:calc(100vw - 18px)`. It must never overlap header/masthead text.
   No other fixed element may overlap the header brand row either.
5. Every dynamic string must render — no "undefined"/"NaN" anywhere. Static demo
   data is fine; test all views.
6. All views work at 1440 and 390. Interactive bits (toggles, section switches,
   file-drop hover, password show/hide) work with plain JS.
7. Where the user picks one of several choices, use the SEGMENTED CHOICE-PICKER
   pattern (pressed pill row, dependent sub-row appears when relevant) — the user
   hates scattered button jumbles.

## View 1 — SETTINGS (fix: today it's a long repetitive card stack with buried bug report)

Real content to show (static demo data, user "Marcus Chen"):
- Profile: display name + phone are EDITABLE; email, role (Field Rep), status
  (Active), address, hire date are READ-ONLY. Make the editable-vs-locked split
  visually obvious (locked rows get a lock glyph / muted treatment) — do not mix
  them indistinguishably.
- Security: change password (current / new / confirm, min 6 chars) — one clear
  path, collapsed behind a "Change password" action, not an always-open form.
- App: install-the-app card (installed state demo) + push notifications opt-in
  (mentions, DMs, activity — one device toggle).
- Appearance: Auto / Light / Dark segmented picker.
- Report a bug: PROMOTE it — quick-access chip in the masthead area that scrolls
  to the section. Area picker (Forms, Sales, Onboarding, Chat, Leaderboard, Other)
  as segmented pills, required short summary, optional details, note that the
  current page URL is attached automatically.
- Account details: member since, territory, employee ID (last 6), active yes/no —
  fold into profile area as a compact stat row, NOT a separate duplicate card.
Masthead numeral idea: number of settings groups (e.g. 5).

## View 2 — ONBOARDING (fix: duplicated progress, awkward horizontal step scroll, one-item-at-a-time)

Demo: entry-level rep "Marcus Chen", 8 checklist items, 3 approved, 1 in review,
1 needs attention (rejected with reason "Photo is blurry — retake in good light"),
3 to do. Items: W-9 · Background Check Authorization (FCRA) · Background/Drug
Screen Authorization · Driver's License Photos (front & back) · Contract ·
Direct Deposit · Compensation · Onboarding Submission.
- ONE progress readout only (masthead numeral = items left, e.g. 5, plus a single
  progress bar). No duplicate progress blocks.
- Full checklist visible as a vertical list/board (no horizontal scroll of steps);
  each row: status (Done / In review / Needs attention / To do), what it is in
  plain words, and the one next action.
- Rejected row is loud: reason shown inline + "Resubmit" action.
- Two action types: UPLOAD items (file drop: PNG/JPG/PDF, 4 MB max; license =
  front + back slots) and E-SIGN items (FCRA, Contract, Direct Deposit,
  Compensation): "Check your email for the signing link — this completes
  automatically after you sign." Make e-sign items look actionable, not dead.
- Note on sensitive items: never type raw SSN / card numbers here.

## View 3 — SIGNUP (public page — no portal chrome inside this view's canvas)

- Keep split-brand feel: brand statement panel + form card (stacked on mobile,
  form first).
- Fields: full name, email, password (show/hide + live strength meter: weak/okay/
  strong bar), confirm password (NEW — today it's missing).
- After-submit clarity (fix): show the 3-step "what happens next" strip right on
  the form: 1 Verify your email · 2 Manager approves your account · 3 You get your
  role and start onboarding. Include a demo "pending approval" success state
  (toggleable via a demo button) so the user can see it.
- Sign-in link + back-to-main-site link.

## Process

Serve/test at http://localhost:8899/member-round1/<file>.html (http server already
runs rooted at design-mockups/). Files must be UTF-8 (no mojibake — use proper
· / — characters). Keep each file under ~1200 lines. When done, list the three
file paths and any deviations from this brief.
