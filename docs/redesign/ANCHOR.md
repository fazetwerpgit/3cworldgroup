# Portal Redesign — Anchor Doc

Anchor doc for the redesign. Read this at the start of every session. Do not
re-derive intent from scratch — this file is the intent.

**Scope decision:** visual reskin + UX/IA overhaul of the employee portal only.
Not a tech re-architecture. Not a ground-up rebuild. Not the public site.

Companion: [research-playbook.md](./research-playbook.md) — CRM/B2B UI research
(Salesforce, HubSpot, Pipedrive, Close, Attio, monday, Linear, Stripe) distilled
into patterns per archetype. Use it as the pattern source when executing slices.

---

## 1. Scope

In scope — everything under `/portal` (rep + admin/ops) and the components
that serve it:

- `src/app/portal/**` (all pages + layouts)
- portal-serving components: `src/components/portal/**`, `src/components/ui/**`,
  `sales/**`, `leaderboard/**`, `chat/**`, `training/**`, `forms/**`,
  `onboarding/**`, `admin/**`, plus shared chrome used inside the portal
- portal design tokens in `src/app/globals.css` (`:root`, `.dark`,
  `.portal-*` utilities)

Out of scope — do not touch:

- Public marketing pages: `page.tsx` (home), about, careers, contact,
  culture, opportunities, services, privacy, terms
- Public recruit flow: `apply/`, `onboard/[token]/`
- Any `src/app/api/**` route logic, `src/lib/**` behavior, Firestore rules,
  auth, or data shape
- `firebase.json`, `firestore.rules`, `storage.rules`, config files

If a change to a shared token would visibly alter a public page, gate it under a
portal-scoped selector instead.

## 2. Non-negotiables to preserve (from HANDOFF.md)

- No raw SSNs / card numbers / bank numbers stored — status/reference/token only.
- Email templates are copy-paste only; the app does not send email.
- Google Meet links only for calls; no in-app video.
- Pipeline stage is derived, never manually stored.
- Never link to `/portal/login`; `/portal` is the login entry.
- Keep all role gates: `ProtectedRoute`, `isRole(...)`, `hasPermission(...)`,
  `getEffectiveRole(user)`. Do not add ad-hoc role checks in components.
- Roles: `PlatformRole = admin | operations`; `FieldRole =
  entry_rep | l1_manager | l2_manager`. IBO is a flag, not a role.
- Preserve every existing route and its data behavior. Reskins and layout
  changes only — no renamed/removed routes unless explicitly approved.

## 3. Design language (the reskin)

Keep the brand. This is a polish + coherence pass, not a new identity.

- Color: navy `#0A1F44`, lime `#8dc63f` (hover `#7ab82e`). Primary buttons
  = lime bg + navy text (never white text on lime). Existing semantic
  tokens in `globals.css` are the source of truth — reskin by editing tokens
  and `ui/**` primitives, not per-page hex values.
- Surface system: `portal-canvas` for the page background, `portal-panel`
  for raised surfaces, `portal-rail` for the accent edge. Cards:
  `rounded-lg border-slate-200 bg-white py-0 shadow-sm`; header
  `border-b border-slate-100 p-5`; content `p-5`.
- Radius: `--radius: 0.5rem` (rounded-lg). No `rounded-xl` on portal cards
  unless a primitive injects it and the component overrides back to lg.
- Type: page title `text-2xl font-semibold tracking-tight text-slate-950`;
  intro `mt-2 max-w-2xl text-sm text-slate-600`. Establish a consistent scale
  (title / section / body / meta) and apply it everywhere.
- Layout wrappers: page `mx-auto max-w-[1500px] space-y-5`; form pages
  `mx-auto max-w-[1100px] space-y-5`.
- Dark mode must keep working — token flips live in `.dark`. Verify every
  reskinned screen in both themes.
- Avoid: decorative "AI-looking" sections, giant marketing cards,
  single-color gradient sludge, duplicate portal chrome inside pages already
  wrapped by a layout, mojibake/decorative glyphs in copy.

Target feel: a sales-ops command center reps and managers use daily —
operational, dense-but-calm, fast to scan.

## 4. Page archetypes

There are ~6. Perfect ONE of each, lock the pattern here, then fan out.

1. **Dashboard** — `portal/dashboard`. Workbench header + stat row + prioritized
   action/queue cards. This is the IA showpiece; see §5.
2. **List / table** — sales, leaderboard, admin list pages. Consistent table
   primitive, filter/search bar, empty state, loading skeleton, row actions.
3. **Detail** — `sales/[id]`, `training/[id]`, `admin/users/[id]`. Header with
   status + primary action, then sectioned panels.
4. **Form** — the intake forms + `sales/new`, `sales/[id]/edit`. `max-w-[1100px]`,
   grouped field sections, sticky/clear submit, inline validation, review state.
5. **Admin review** — `admin/*-reports`, `admin/onboarding`, approvals. Queue +
   review-detail pattern; consistent approve/reject affordances.
6. **Feed / realtime** — chat, shorts, calls. Distinct from the above;
   nail one interaction pattern and reuse.

For each archetype, capture in this file once perfected: wrapper, header,
card pattern, empty state, loading state, primary-action placement.

## 5. UX / IA overhaul latitude

Allowed to change (this is the "overhaul" half):

- Sidebar grouping & order. Current groups: main destinations, collapsible
  Forms folder, resources (University, Links), ops items, admin items.
  Reassess grouping, labels, order, and which items surface by role. Keep every
  destination reachable and keep role/permission gating intact.
- Dashboard composition — what reps vs managers vs admins see first; surface
  the day's priorities (pending approvals, onboarding gaps, call schedule,
  leaderboard rank) instead of flat links.
- Mobile nav & responsive behavior — the mobile menu, breakpoints, table
  reflow on small screens.
- Cross-cutting states — unify empty, loading (skeleton), and error states.
- Consolidation — merge visually redundant screens where it doesn't change
  routes/data (e.g. Shorts already living as a University tab is the right
  instinct; look for more).

Not allowed:

- Changing routes, route data, API contracts, Firestore shape, or role logic.
- Introducing new dependencies without approval.

## 6. Slice sequence (do in order; each slice ships independently)

1. **Tokens + primitives.** `globals.css` portal tokens + `src/components/ui/**`.
   Reskin here first so pages inherit. No page edits yet.
2. **Chrome.** `PortalSidebar`, `PortalHeader`, portal `layout.tsx`, mobile menu.
   Land the IA changes from §5 here.
3. **Dashboard** (archetype 1) — lock the pattern.
4. **One exemplar of each remaining archetype** (2–6). Lock each pattern in §4.
5. **Fan-out.** Apply locked patterns across the rest of `/portal`, a few files
   per slice.
6. **QA sweep.** Desktop + mobile, light + dark, per page.

## 7. Verification gate (run before calling any slice done)

```bash
npx tsc --noEmit
npx eslint <only the files changed in this slice>
npm run build
git diff --check
```

Plus: route smoke check the touched pages return 200, and eyeball light+dark at
mobile and desktop widths. Do not claim full `npm run lint` is clean — there is
pre-existing global lint debt outside the portal slice; leave it unless a slice
is explicitly about it.

## 8. Definition of done (per slice)

- Matches the patterns in §3–§4 (or updates them here if the pattern evolved).
- Both themes verified; mobile + desktop verified.
- Gate in §7 passes on the changed files.
- No route/data/role behavior changed.
- This spec updated if any locked pattern changed.

---

## 9. Locked decisions (client Q&A, 2026-07-02)

Answered directly by the client. These override defaults in the research
playbook where they conflict.

**Overall direction**
- Sidebar: **dark navy** (`#0A1F44`) with lime active indicator, light content
  canvas. Classic command-center split.
- Density: **dense but calm** — compact rows, pro-tool feel, extreme size
  contrast between KPI numerals and body text so density never reads generic.
- Wow factor: **refined polish** — precision, subtle motion (120–300ms,
  ease-out), tasteful lime discipline. NOT max-gamification.
- Taste anchors: client undecided between reference products → direction call:
  **modern-sleek (Linear/Attio/Stripe) base + Pipedrive-style status color for
  pipeline urgency**.
- Theme: **light default**; dark mode kept working as a toggle.

**Dashboard**
- Rep dashboard leads with **their numbers** (sales MTD, quota progress,
  leaderboard rank) — stat row first, then today's actions.
- Manager/admin dashboard leads with the **work queue** (approvals, onboarding
  reviews, report submissions).
- Stats rendered as **numbers + tiny trends** (sparkline / vs-last-week delta),
  not full charts, not plain figures.

**Leaderboard**
- **Podium top 3 + rank-movement arrows**; own row always highlighted.
- **Show everyone, no shame styling** — full list, neutral table below the
  podium, no fading/collapsing the bottom.
- **No TV mode** — team is remote/field; mobile leaderboard covers it.

**Behavior / feedback**
- Celebrations: **subtle acknowledgment** — polished toast on closed sale,
  animated rank arrow. No confetti.
- Stale deals: **yes, visible warnings for everyone** — amber after ~7 idle
  days, red after ~14 (Pipedrive-style; thresholds tunable later).
- Sale click target: **slide-over side panel** over the list (arrow to
  next/prev, expand to full page). Full page remains for deep work.

**Platform**
- Locked chrome pattern (Slice 2, 2026-07-02): navy sidebar 240px, nav row =
  36px, left icon (18px) + label, active = `bg-white/10` pill + 2px lime rail +
  lime icon; section headers 11px uppercase white/40, collapsible with
  localStorage persistence. Mobile = existing sheet sidebar + new
  `MobileBottomNav` (Dashboard/Sales/Chat/Board, hidden on /portal/chat).
- Locked login pattern: navy brand deck + diagonal lime seam (two stacked
  clip-path layers), `.portal-display` (Archivo) headline, form panel light.

- **Phone is primary for reps** — mobile gets first-class treatment (chat,
  leaderboard, forms especially). Mobile bottom-nav pattern from the playbook
  applies.
- Pet peeves to design against: **"feels cheap/generic"** and **"hard to find
  things"** — geometry-true skeletons, zero layout shift, consistent spacing;
  flat nav with clear labels, ⌘K palette, obvious grouping.
