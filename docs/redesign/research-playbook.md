# CRM/B2B UI Design Playbook
## Reskinning the 3C World Group Sales Portal — navy `#0A1F44` + lime `#8dc63f`, Next.js + Tailwind + shadcn/ui
### Target feel: sales-ops command center — operational, dense-but-calm, fast to scan, professional wow factor

> Produced 2026-07-02 by a 10-agent research sweep (Salesforce Lightning, HubSpot,
> Pipedrive, Close/Attio, monday/Copper/Zoho, plus cross-cutting research on sales
> dashboards, nav IA, tables/density, and premium polish). Decisions the client has
> already made live in [ANCHOR.md §9](./ANCHOR.md) and override this doc where they conflict.

---

## 1. Cross-Product Consensus Patterns

These appear in nearly every product studied (Salesforce, HubSpot, Pipedrive, Close, Attio, monday, Linear, Stripe, Notion, Front). Treat them as defaults, not decisions.

### Navigation / App Shell
- **Dark chrome, light canvas.** Every best-in-class tool separates a dark/dimmed nav layer from a bright data canvas (Front, Linear, HubSpot, monday, Stripe). Our navy sidebar + white/`#F5F7FA` content area is the textbook execution — brand and function align.
- **Collapsible sidebar → icon rail (~240px → ~56px)**, cookie-persisted so SSR renders the right width with zero layout shift (shadcn `collapsible="icon"` gives this free). Cmd/Ctrl+B toggle, tooltips on collapsed icons.
- **Order nav by task frequency, not taxonomy.** HubSpot tuned grouping with real switching data; Stripe orders by workflow. Daily group first (Dashboard, Pipeline, Leaderboard, Chat), then growth (University, Forms), then a role-gated Admin group rendered only for admins (pattern already in `PortalSidebar.tsx`).
- **Flat IA, max 2 levels.** Sections + items only (Linear, Front). Stage filters, form types, and queue tabs live *in-page*, never as sidebar children.
- **Accent discipline in chrome:** inactive items white at ~60% opacity, active item = white/10 pill + lime icon or 2–3px lime left bar. Lime appears nowhere else in the sidebar except unread dots.
- **Cmd+K command palette as parallel nav** — universal across Linear/Stripe/Attio/Notion. Search pill at the top of the sidebar with the `⌘K` hint printed inside it.
- **Sidebar anatomy:** org identity block top (logomark + portal name), personal block bottom (avatar, name, role, kebab with Profile/Sign out). shadcn `SidebarHeader`/`SidebarFooter` map 1:1.

### Dashboard
- **KPI stat row first** — 3–4 compact metric cards (big tabular-nums number, muted label, delta chip, optional 32px sparkline) answering "am I okay?" in one second. Cap the whole page at 5–8 metrics.
- **Metrics first, then the work:** KPI strip → action queue / charts → tables. No oversized greeting hero.
- **One global period filter** (Today/WTD/MTD/QTD) re-scoping all cards at once (HubSpot).
- **Drill-through everywhere:** every tile and chart segment links to the filtered list behind it, with an "Updated Xm ago" timestamp (Salesforce). Clickable numbers = trust.
- **Rep vs manager: same layout, different data.** Reps see only metrics they can act on today; managers additionally get rankings, per-rep quota stacks, and stalled-deal tables. One route, role-conditional panels, shared components.

### Tables / List Views
- **Dense single-line rows, 36–44px**, 13–14px text, hairline (1px) row dividers only — no zebra, no vertical rules, no shadows.
- **Left-align text, right-align numbers, `tabular-nums` on all money/counts.** Non-negotiable; this is half of what makes Stripe tables read "financial-grade."
- **Uppercase 11–12px muted column headers**, sortable with hover-revealed chevrons, sticky thead.
- **Status as color-coded pills — the only saturated color in the table.** Everything else in 2–3 muted grays; one accent element per row max.
- **Hover-revealed row actions + inline editing.** Rows are quiet at rest; hover exposes an action cluster and a checkbox; interactive cells (stage, owner) edit via in-place popover, no navigation.
- **Saved views as tabs above the table** ('My deals', 'Stale >14d', 'Closing this month') with visible, individually-removable filter pills. Filter state in URL (nuqs) so views are shareable.
- **View switcher on the same data:** Table | Board minimum. Kanban columns always carry live aggregates (count + summed $ value) in the header — universal across Salesforce, HubSpot, Pipedrive, Copper.
- **Bulk actions appear only on selection** — floating bottom bar or toolbar-swap, never standing chrome.

### Detail Pages
- **Three-zone anatomy** (converged across all products): identity/highlights header (name large + 4–6 key stats + capped visible actions), a **stage progress bar** (chevron/segmented, completed/current/future states, clickable to advance), and a body split into **facts column + chronological activity timeline + related records**.
- **Next action above history.** Pipedrive's Focus-above-History, Salesforce's Path guidance — the page answers "what now?" before "what happened?"
- **One merged timeline** (calls, notes, stage changes, form submissions, chat mentions) with type icons, day grouping, verb-first sentences, relative timestamps.
- **Max 3 visible action buttons**, rest in an overflow menu; destructive/rare actions (delete, reassign) separated from daily quick actions.
- **Slide-over panel as default detail view** (Stripe, monday, Attio, Linear): row-click opens a Sheet over the list, "expand" escalates to the full route, arrow keys move to next/prev record.

### Universal Craft Rules
- **Loading:** geometry-true skeletons matching exact final layout (row heights, column widths, avatar circles); ~200–300ms delay so fast loads never flash a skeleton; never a centered spinner over a table.
- **Empty states:** two variants — true-empty (small line icon + one sentence + one primary CTA) and filtered-empty (keep filter pills visible + "Clear filters" button). Empty queue = celebratory ("All caught up").
- **Optimistic UI on every mutation** — stage changes, sends, edits reflect in <100ms, reconcile in background with rollback toast.
- **Motion norms:** 120–200ms micro-interactions, 200–300ms panels, ease-out, springs only for drag. Nothing bouncy, nothing over 300ms on the work surface.
- **Elevation vocabulary:** borders for in-page surfaces, shadows only for floating layers (dropdowns, popovers, dialogs, palette). Two tiers, no exceptions.

---

## 2. Differentiators Worth Stealing

High-impact patterns specific to one product:

| Source | Pattern | Why steal it |
|---|---|---|
| **Pipedrive** | **4-state next-activity color language**: red = overdue, green/lime = due today, **amber = nothing scheduled** (treated as a problem), slate = future scheduled. Applied uniformly on every card and row. | Treating "no next step" as a warning state is the signature sales-ops move. One rule creates the entire operational feel. |
| **Pipedrive** | **"Rotting" deals** — card tints red after N idle days per stage; severity escalates from icon → whole card. | Ambient, automatic accountability; the board self-polices. |
| **Pipedrive** | **Drag-summoned action footer** — Won/Lost/Move drop zones materialize along the bottom edge only mid-drag, then vanish. | Terminal actions with zero standing clutter. |
| **Pipedrive** | **Days-per-stage counts under each stage-bar segment** on the detail page. | One component = status display + bottleneck diagnostic + stage-change control. |
| **Salesforce** | **Path with "Guidance for Success"** — expandable drawer under the stage bar with 2–4 stage-specific required fields + a manager-written coaching tip. | Turns a status indicator into a workflow driver. Cheap; huge perceived polish. |
| **Salesforce** | **Inline table edit with docked save bar** — hover pencil, dirty-cell tint, bottom bar counting unsaved changes with Save/Cancel. | Fix a dozen close dates without a dozen modals. |
| **Salesforce** | **Search that opens already answered** — focusing global search shows the 5 most recent records before a keystroke. | Reps touch the same ~10 deals daily; reads as "the app knows me." |
| **HubSpot** | **Auto-expiring "Up next" suggestions** — rule-generated items ("deal untouched 7 days", "form awaiting fix") that appear only when relevant and silently disappear. | Feels intelligent with zero ML; never nags with stale items. |
| **HubSpot** | **Per-field change history on hover-edit** ("changed by Maria, 2d ago"). | Builds trust in the data in dense screens. |
| **Close** | **Inbox-zero queue mechanics** — Today/Upcoming/Done tabs, checkbox-complete with strike/fade, snooze, bulk-clear. | The portal becomes "a machine that drains, not a report that sits." |
| **Salesloft** | **Signal-driven reason chips** in the queue — each row explains *why* it ranks there ("No touch in 5 days"). | Turns a todo list into an assistant. |
| **monday** | **Pipeline "battery" bar** — one full-width stacked bar of all open deals segmented by stage color. | Reads the whole team's quarter in one second; trivially cheap (flex divs). |
| **monday** | **Solid-fill status pills that fill the whole cell** (white text on stage color) as an *option* for the admin queue's status column. | Control-panel scan speed at density. |
| **Stephen Few / Ambition** | **Bullet charts for quota** — thin navy actual bar + **lime target tick**, one row per rep, stackable. Never gauges/donuts. | 10 reps scan in the space of one gauge; the lime tick becomes a portal-wide visual signature. |
| **Ambition / Spinify** | **Leaderboard TV mode** — `?tv` query param renders the same route full-bleed navy, 2x type, podium + live movement arrows for the office screen. | Classic sales-floor culture play, near-zero extra code. *(Client decision: skipped — team is remote/field.)* |
| **Attio** | **One unified composer** (mentions, slash commands, Enter behavior) reused in chat, deal notes, and admin comments. | Inconsistent editors are what make internal tools feel stitched together. |
| **Stripe** | **"Shortcuts/Recent" sidebar micro-section** — last 3 visited deals from localStorage under a muted "Recent" label. | The sidebar quietly learns each rep's current deals. |

---

## 3. Wow-Factor Techniques Ranked by Impact-to-Effort (Tailwind/shadcn)

Ranked best ratio first. Effort assumes shadcn/ui + Tailwind + Next.js App Router already in place.

| # | Technique | Impact | Effort | Notes |
|---|---|---|---|---|
| 1 | **⌘K command palette** (shadcn Command/cmdk): deals, pages, people, actions; `⌘K` hint printed in sidebar search pill; navy-glass styling (`backdrop-blur-md bg-[#0A1F44]/80 border-white/10`) | Very high — the single strongest "Linear-grade" signal per every source | ~1 day | The one glass moment allowed |
| 2 | **Lime discipline as a token rule** — lime ONLY for: primary buttons, active-nav indicator, focus rings, positive deltas, quota target ticks, won badges, unread dots. Enforced via CSS variables, not memory | Very high — the restraint *is* what reads premium | Hours (config) | Lime on white fails text contrast; use as fills/borders/badges with navy text |
| 3 | **Geometry-true skeletons per route** — `loading.tsx` renders the real Table/Card components with Skeleton cells; 200–300ms display threshold | High — zero layout shift is the strongest subconscious "serious product" signal | ~1 day total | Never a spinner over a table |
| 4 | **Optimistic everything** + hover-revealed row actions (`opacity-0 group-hover:opacity-100`) | High — perceived <100ms is the most premium quality a daily tool has | Low, incremental | React Query/SWR mutate + rollback toast |
| 5 | **Pipedrive 4-state activity dot** on every pipeline row/card, urgency-first default sort (overdue on top) | High — instantly reads sales-ops serious | 1–2 days (needs `next_activity_date`) | The opinionated default sort matters as much as the dot |
| 6 | **KPI count-up on first paint** (400–600ms ease-out, once) + inline 32px axis-less sparklines, mono tabular-nums | High | ~½ day | 30-line hook or framer-motion `animate` |
| 7 | **Slide-over detail Sheet with j/k / arrow next-prev navigation** on pipeline + admin queue | High — triage superpower no CRUD app has | 1–2 days | Next.js intercepting routes for URL-addressability |
| 8 | **Live kanban column roll-ups** — 'Negotiation · 7 · $412K' recalculating optimistically on dnd-kit drag, brief lime flash/count-up on the receiving total | High — drag becomes financial feedback | 2–3 days (needs dnd-kit board first) | The defining CRM wow across 4 products |
| 9 | **Bullet-chart quota motif** — navy bar + lime target tick, reused on dashboard card, every leaderboard row, manager stack | High — a recognizable visual signature | ~1 day (flex divs, no chart lib) | Ban gauges/donuts entirely |
| 10 | **Pipeline battery bar** on dashboard (stacked flex divs by stage color) | Medium-high | Hours | Same stage colors as table pills — one color language |
| 11 | **Floating bulk-action bar** — bottom-center navy pill, animates in only when selection > 0 ("7 selected · Change stage · Approve") | Medium-high | ~½ day | One component, feels engineered |
| 12 | **Chevron stage Path with 'Mark Stage Complete' + coaching drawer** on detail pages (clip-path polygons; completed = lime + check, current = navy, future = gray-200) | Medium-high | 1–2 days | Coaching copy is content, not code |
| 13 | **Reason chips in the My Day queue** ("No touch in 5 days" navy-outline chip + inline lime action) | Medium-high — "intelligent" with rule-based logic | 1 day | Rules: idle deals, due forms, unread mentions |
| 14 | **Won-deal celebration** — 200ms lime sweep on the status pill + one-time navy+lime confetti, user-toggleable, closes only | Medium (sales-culture high) | Hours (canvas-confetti) | *(Client decision: subtle acknowledgment only — toast + rank arrow, no confetti.)* |
| 15 | **Leaderboard TV mode** (`?tv`: full-bleed navy, 2x type, podium, ▲/▼ movement arrows, "week resets in 2d 4h" countdown) | Medium (high for culture) | ~1 day (same route, style variant) | *(Client decision: skipped — remote team.)* |
| 16 | **Inline edit + docked save bar** on the pipeline table (hover pencil, dirty tint, "3 unsaved — Save/Cancel" navy bar) | Medium | 2–3 days | Ship after the table is stable |
| 17 | **One ambient lime radial glow** (4–8% opacity, blurred) behind the dashboard KPI band | Low-medium, cheap polish | Minutes | The *only* gradient in the app |
| 18 | **Copy-ID with inline ✓ swap, animated check on form submit, sonner toasts in navy-glass, global lime focus ring** (`ring-2 ring-lime-500/50`) | Medium cumulative | Hours each | The "app acknowledged me" layer |

---

## 4. Anti-Patterns to Avoid

- **Color inflation (the monday failure):** 40 status colors, rainbow rails, colored emoji names = "visual overload" that competitors literally market against. **Hard cap: 4–5 semantic colors total** (lime = go/won/healthy, amber = needs action, red = stalled/overdue, slate = cold/future, navy tints = open stages). Never a 6th. No per-user or per-channel custom colors in chat or pipeline.
- **Uniform gray density (the Zoho failure):** everything 13px, everything the same weight = "dense and generic." Density needs extreme size contrast — 30–36px KPI numerals vs 13–14px table text — and weight/opacity hierarchy so the eye knows where to land.
- **Lime as decoration or large fills.** High-chroma green gets loud fast on white and fails text contrast. Buttons, pills, dots, ticks, rings only — never headings, never body links (use desaturated navy-blue for links), never card backgrounds.
- **Shadows on in-page cards.** Border-first elevation; shadows-on-everything is the #1 amateur-dashboard tell. Same for large radii — use 6–8px; big radii + soft shadows read consumer, not operational.
- **Gauges, donuts, and pie charts** for quota/breakdowns. Bullet bars and ranked horizontal bars; actionable lists are always tables, never charts.
- **Spinners over tables, flash-of-skeleton on fast loads, layout shift on content swap.** Codify the 300ms rule.
- **Slow or bouncy animation** (>300ms, spring on non-drag). Charming on day one, infuriating by day two of 8-hour use.
- **One universal table config for all roles.** Admin queues should be denser (smaller rows, bulk-select, sticky action bar) than rep pages — same components, different layouts.
- **Deep sidebar trees.** Stage filters and queue states are in-page tabs, not nav children.
- **Blank "No data" empties and hiding active filters on filtered-empty** — users think data is lost.
- **Showing every field to every role** (Zoho's 112 "learning curve" G2 complaints). Role-scoped surfaces beat configurable everything.
- **Red count badges everywhere.** Default unread indicators to calm lime dots; counts only inside the chat page itself.
- **Publicly spotlighting the bottom of the leaderboard.** Fade/truncate below a threshold; add non-revenue categories so more reps have a ladder. *(Client decision: show everyone, but only top 3 get special treatment — neutral table below, no shame styling.)*
- **Confetti/gamification on routine actions.** Celebration is reserved for closed-won only, with an off switch.

---

## 5. Recommendations by Page Archetype

### Foundation (applies everywhere first)
- **Tokens:** canvas `#F5F7FA`-family, white cards + `border-slate-200` 1px, navy `#0A1F44` for chrome/headings/table-header text, lime per the discipline rule. Dark mode = brand mode: bg `#0A1F44`, cards one step lighter (`#0f2a55`), borders `white/10`, text at 100/70/45% opacity tiers, lime brightened (~`#9fd44f`) for small text on navy.
- **Type scale (exactly 5–6 steps):** 12px labels/meta, 13–14px body/table (14px base), 16px section titles, 24px page titles, 30–36px KPI numbers. Mono/`tabular-nums` on all currency, counts, IDs (Geist Mono or JetBrains Mono via next/font).
- **Geometry:** `rounded-md` (6px) default, 4px spacing grid, borders over shadows, house easing `cubic-bezier(0.16, 1, 0.3, 1)`, durations 150/200/300.
- **Shell:** navy sidebar per §1 (240px/56px rail, cookie-persisted, ⌘K pill on top, Recent section, role-gated Admin group); mobile = Sheet nav + fixed navy bottom bar with 4 items (Dashboard, Pipeline, Chat, Leaderboard) with lime active icon and chat unread dot.
- **Density setting:** `data-density="compact|comfy"` on `<html>` driving CSS variables for row height and label placement; default compact-ish.
- **Shared components to build once:** `StatusPill`, `MoneyCell`, `PersonCell`+HoverCard, `RelativeTime`+Tooltip, `EmptyState` (two variants), `SkeletonRow` per table, `BulletBar`, unified composer, `KpiCard`.

### A. Dashboard
- Row 1: **4 KPI cards** — My Sales MTD, Quota % (bullet bar with lime tick), Open Deals, Tasks Due — navy tabular-nums numbers, count-up once, inline sparkline, lime/red delta chips. Optional 5% lime radial glow behind this band.
- Row 2 left (2/3): **"My Day" queue** (Close pattern) — Tabs Today/Upcoming/Done; ranked rows mixing overdue follow-ups, new leads, form-review tasks, unread mentions; each row = reason chip + entity + inline lime action button; checkbox-complete with strike/fade; snooze; auto-expiring HubSpot-style suggestions. Empty = lime check + "All clear."
- Row 2 right (1/3): mini-leaderboard (top 5 + your row) + team activity feed rail.
- Row 3: **pipeline battery bar** (full-width stacked by stage) and/or recent-activity table.
- One global period Select re-scoping everything; "Updated 2m ago" in corner; every tile drills through to the filtered list. Managers additionally get per-rep bullet stack + stalled-deals table on the same route.
- *(Client decision: reps lead with their numbers; managers/admins lead with the work queue.)*

### B. List/Table (Pipeline)
- **Toolbar:** saved-view tabs ('My deals' default, 'Team', 'Closing this month', 'Stale >7d') with lime underline on active; Filter button + removable filter pills (field–operator–value, click-to-edit); search with `/` shortcut; Table|Board toggle; density toggle. All state in URL via nuqs; "Save view" appears only when filters diverge.
- **Table:** TanStack + shadcn, 40–44px rows, hairline dividers, sticky uppercase muted headers, right-aligned tabular currency, stage as tinted pill (navy tints open, lime tint won, amber stalled, red lost), Pipedrive activity dot column, owner avatar 20px, relative timestamps. Hover reveals checkbox + action cluster; inline popover edit on stage/owner; later: docked save bar for batch inline edits. Footer totals row. Urgency-first default sort.
- **Board:** dnd-kit columns, headers 'Stage · 7 · $412K' with live optimistic roll-up + lime flash on update; sparse cards (name, amount, avatar, days-in-stage chip → amber when stale, red wash when rotting); drag-summoned Won/Lost footer (Won = lime zone; Lost drop opens mandatory reason dialog); empty columns stay rendered with dashed '+ Add' ghost.
- Bulk selection → floating bottom navy pill bar. Row click → detail Sheet (see C). Mobile: rows become `border-l-2` cards (name, amount, stage chip).

### C. Detail (Deal/Lead)
- Default presentation: **right Sheet (~480–560px)** over the list via intercepting routes, arrow/j-k to next record, expand icon → full `/pipeline/[id]` page. *(Client confirmed: side panel default.)*
- Full page: **highlights header** (deal name large, 4–6 label-over-value micro-stats, lime primary + 1 secondary + overflow menu; Won/Lost as explicit right-aligned buttons) → **chevron stage Path** (completed lime+check, current navy, future gray; clickable; days-per-stage counts under segments; 'Mark Stage Complete' button; expandable drawer with 2–4 stage key fields + manager coaching tip) → body: left rail of inline-editable fields (hover pencil, per-field "changed by X, 2d ago"), main column with **"Next steps" panel pinned above** a day-grouped, type-filterable timeline (Tabs: Overview/Activity/Forms), right/below: related cards with counts ('Submitted Forms (2)') showing 3 rows + View all.
- After logging a call or advancing a stage: **"Schedule next step?" popover** (date + type) — the Pipedrive habit loop. HoverCard on every person chip.
- Note: pipeline stage is DERIVED in this codebase — the stage Path renders derived state; "advance" affordances only where an underlying action exists. No manual stage writes.

### D. Form (intake/native Formstack replacements)
- White card on gray canvas, single column, 16px section titles, 12px muted labels; compact spacing per the density token.
- **Path-style step indicator** for multi-step forms (same chevron component as deals — one visual language).
- Inline validation on blur, lime focus ring, sticky footer bar with lime primary submit; on submit, **animated checkmark draw** + toast, then a purposeful "what happens next" state (review timeline), not a bare thank-you.
- Encrypted-field UX (SSN/DL#): masked at rest with an admin-only reveal affordance and an explicit "encrypted" microcopy/lock icon — trust signaling matters here.
- Autosave draft with a quiet "Saved" indicator (no toast spam).

### E. Admin Review Queue
- **Split view** (Salesforce console pattern): ~320px left rail of pending submissions (status dots, urgency-first ordering, 'Needs review (4)' above 'Approved'), right pane = selected record with sticky Approve/Reject bar (lime approve, ghost reject; reject requires a structured reason Select). Selected row = lime left border; URL state via nuqs.
- Denser than rep pages: smaller rows, more columns, bulk-select checkboxes, floating bulk approve/reject bar.
- **Queue mode:** step through submissions one at a time full-width with j/k — inbox-zero mechanics, bulk mark-done.
- Empty = "Queue clear" + last-reviewed timestamp (empty as positive status).

### F. Feed / Realtime (Chat + activity)
- **Docked chat launcher** (Salesforce utility-bar pattern): slim persistent affordance bottom-right, opens a panel over any page, mounted in the root layout so state survives route changes; unread = calm lime dot (counts only inside the chat page).
- One **unified composer** (@-mentions, identical toolbar and Enter/Cmd+Enter) shared with deal notes and admin comments.
- Activity feed component (icon-keyed, verb-first, day-grouped, actor avatar, relative time, type filters) built once and reused: deal timeline, dashboard team-activity rail, manager view. Lime dot on newest unseen items.
- Realtime "signal" rows (new submission, deal moved, close) stream into the feed with a 150ms fade-in — leverage the existing realtime chat infra. Won-deal events get the (subtle) celebration treatment.
- Empty channel: "No messages yet — say hello" + composer focused; never a blank pane.

---

## 6. Open Design Decisions — RESOLVED (see ANCHOR.md §9)

The research flagged 12 open decisions; the client answered the key ones on 2026-07-02:

1. Sidebar vs top bar → **dark navy sidebar**.
2. Light vs navy-dark default → **light default**, dark kept as toggle.
3. Leaderboard competitiveness → **podium top 3 + movement arrows, full list shown, no shame styling**. Extra ladders (most improved etc.) not requested — future option.
4. Celebration intensity → **subtle** (toast + rank arrow), no confetti.
5. Stale-deal warnings → **yes, visible to everyone**: amber ~7 idle days, red ~14 (thresholds tunable).
6. Detail presentation → **slide-over panel default**, expandable to full page.
7. Personalization depth → not decided; start with role-based only, revisit later.
8. Status pill rendering → designer's call: **soft tints for rep pages**, consider solid fills for admin queues.
9. Kanban card fields / stage names / coaching copy → business content, gather during dashboard + pipeline slices.
10. Weighted pipeline → not decided; show raw sums until the business assigns stage probabilities.
11. TV mode → **skipped** (remote/field team).
12. Density default → **compact ("dense but calm")**; phone is PRIMARY for reps — mobile is first-class, not an afterthought.
