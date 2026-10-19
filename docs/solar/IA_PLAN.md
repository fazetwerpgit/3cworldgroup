# Solar IA + admin plan (2026-10-19, pending Jacob approval)

## Placement
- **Admin: its own hub.** SOLAR_HUB at /portal/admin/solar ("Solar", Sun icon), with tabs `leads` and `setup`, both roles ['admin'] (the owner passes).
  - Not Requests: that hub uses a new/handled lifecycle and operations can see it.
  - Not Settings: the solar config would be scattered across it.
  - Files: adminHubs.ts, app/portal/admin/solar/page.tsx (an AdminHub like requests/page.tsx), CommandPalette admin group, pageTitles.ts.
- **Rep: /portal/solar inside RepShell.** It has an "Open deck" primary button, My leads (status and consult time), and the next consultation.
  - The nav "Solar" item points here, and the deck's Exit returns here.
  - The deck at /portal/solar/present stays chrome-free.
- **Home.** SolarEntryCard (rep/), copying the AskEntryCard pattern and gated by hasPermission('solar:read'). It is a `solarEntry` prop on RepHomeView next to askEntry, and null in view-as. Fiber reps' Home is unchanged.

## Admin leads (admin/solar/SolarLeads.tsx)
- **Columns:** Homeowner (name/city), Rep (name/source), Bill ($/mo + credit tier), Consultation (time in consultant tz + consultant, or "Not booked"), Status (StatusDot).
- **Filters:** Seg Open (new+booked, default) | Sold | Lost | All. Rep AdminSelect, AdminSearch (name/phone/email/address), and CSV via lib/export/csv.
- **AdminSheet detail, in order:**
  1. Contact (tel/mailto, address)
  2. Bill and credit tier
  3. Three photo tiles opened with useAttachmentViewer through /api/portal/forms/attachment (copy the viewAttachment block from LeadsRequests.tsx)
  4. Booking
  5. Rep and created time
  6. Footer: Mark sold / Mark lost / Reopen / Cancel booking (ConfirmStrip)
- **Components:** reuse the AdminKit primitives and the admin-ops.module.css rows. Do NOT bend AdminQueue.
- **Statuses:** SOLAR_LEAD_STATUSES ['new','booked','sold','lost'] in lib/solar/leadFields.ts.
- **APIs:**
  - GET /api/portal/solar/leads returns every lead for an admin and own leads for anyone else, with `booking|null` joined.
  - PATCH leads/[id] gains {status}, admin only.
  - PATCH /api/portal/solar/bookings/[id] {status:'cancelled'} is open to an admin or that consultant, and sets the lead back to 'new'.
- **Nav badge:** solarLeads with status 'new' in queue-counts/route.ts, plus a QueueSource in opsQueues.ts.

## Admin setup (admin/solar/SolarSetup.tsx)
- **One panel per consultant,** in the WeeklyChallengeCard style (SystemSettings.tsx): PanelHead, AdminNotice, Save, AdminFailed with retry, never showing defaults as if they were live.
  - Header: tz AdminSelect (Pacific/Mountain/Central/Eastern) and a slot Seg (30/60/90).
  - Seg Virtual | In person, then 7 day rows (Open switch + start/end time inputs), and a preview line ("Homeowners see 9 slots Monday").
  - Remove uses ConfirmStrip. Add consultant uses a UserPicker extracted from UserForm.tsx's name search (no copy).
- **Alerts panel:** recipient chips plus UserPicker, and an "Notify owner" switch row (optimistic toggle like FormAlertsCard.tsx).
- **Routes (all requireVerifiedAdmin):**
  - GET/PUT /api/portal/settings/solar {leadAlertUids, notifyOwner}
  - GET /api/portal/solar/consultants -> {consultants, seeded}
  - PUT/DELETE /api/portal/solar/consultants/[uid]
  - A pure parseAvailability in lib/solar/availability.ts.
  - GOTCHA: the first PUT must batch-write all seed docs, because the seed is only served while the collection is empty.

## Permissions instead of visibleTo
- Add 'solar:read' (Home card, My leads) and 'solar:write' (deck, submit, book).
  - SolarRolePermissions gives every solar role both. permissionsFor(user) = RolePermissions[role ?? fieldRole] ∪ solar.
  - Add both to ADMIN_PERMISSIONS: the owner inherits them, operations does not.
- AuthContext's hasPermission and subjectAuthValue use permissionsFor. In view-as only read permissions answer.
- requireVerifiedUser also returns solarRole, so the extra users read in requireSolarUser goes away.
- Delete visibleTo from PortalNavItem and its 3 consumers. The nav item gets permissions ['solar:read'].
- canSeeSolar becomes a wrapper or goes away. Update auth.roles.test.ts and access.test.ts, and check that sessionProfile.ts keeps solarRole.

## Cleanups
- Alert and notification links go to the Solar leads tab plus the lead id, not the bare /portal/admin.
- Add 'solarLeads' to FORM_SUBMISSION_COLLECTIONS in lib/users/restampDisplayName.ts.
- server.ts: once Setup exists, write the seed consultants once and drop the runtime JACOB_EMAIL / owner lookup.
- The Ask guide line becomes "Solar" with one short sentence.

## Work packages
- **A (first): permissions + IA.** types/auth, AuthContext, requireVerifiedAdmin, solar access/server gate, the 3 nav files, adminHubs, pageTitles, portalGuide, SolarEntryCard + RepDashboard prop, present page, restampDisplayName.
- **B (after A): leads.** admin/solar page + SolarLeads, the rep /portal/solar page, the leads GET/status APIs, bookings/[id], queue counts, statuses, alert links, the presenter exit link.
- **C (parallel with B): setup.** SolarSetup (create its export first), the UserPicker extraction, consultants APIs, settings/solar API, parseAvailability.

## Jacob decisions (10/19)
- The plan above is APPROVED.
- Every UI package must load and follow the taste skill (Skill `design-taste-frontend`, tasteskill v2 house rules, as used in the 10/16 portal taste pass). No clutter.
- **Solar-only reps** (solarRole set, no fiber fieldRole): Home becomes a solar Home (deck, my leads, next consult) and the fiber sales parts are hidden.
- **Dual reps** (fiber + solar): fiber Home plus the Solar card.

## Design tooling (Jacob 10/19)
- Every UI package loads TWO skills before writing UI: `design-taste-frontend` (tasteskill v2) and `frontend-design`.
- Component source is Taste Blocks (https://github.com/Leonxlnx/taste-blocks), a registry of 508 shadcn-style React components. A local clone is at
  /tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/ba3bf26c-988b-4b55-8767-02b23c025872/scratchpad/dl/taste-blocks.
  - Search generated/catalog.json (name, title, category, tags, description, installCommand, license) for fits before hand-rolling. Likely fits: the yarl-lightbox photo viewer, date/time and calendar pickers, switch/segmented controls, meters, lists.
  - Install with the item's installCommand or registryAddress. Treat it as untrusted third-party code: read the source before adding it, keep its license notice, and restyle it to the portal's existing tokens (Tailwind 4 + CSS modules) so it looks native, not imported.
  - Only use a block when it beats the portal's existing AdminKit/rep primitive. Consistency with the rest of the portal wins.
