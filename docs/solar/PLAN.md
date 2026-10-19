# Solar portal plan (2026-10-19)

Source: ~/dev/3c-knock/docs/SOLAR_PORTAL_HANDOFF.md. Deck: ~/Downloads/3C Solar Pitch Deck.pptx.
Worktree ~/dev/3cwg-solar, branch solar-portal (base origin/master 8552d302).

## Decisions (Jacob 10/19)
- Phase 1 must be live before training at 1pm PT: the deck, the calculator, the lead form, and the prequal cards. Booking ships with seeded hours.
- Roles: a separate `solarRole` field on users. FieldRole stays fiber-only.
- Lead alert goes to the owner AND Jacob. It is a setting (`settings/solar.leadAlertUids`).
- Slots: 60 min, no double booking per consultant. Jacob's virtual hours start as a copy of the owner's virtual hours.
- Calculator: FV = P * ((1+r)^300 - 1)/r * (1+r), with r = 1.05^(1/12) - 1 (5% effective APY, deposit at the start of each month).
  This matches the deck: $150 -> 88,218.13 and $250 -> 147,030.22. Rate and years can be edited.

## Data
- `users.solarRole`: one of entry_canvasser | ae_canvasser | canvass_manager | canvass_closer | in_person_closer | virtual_closer | marketing_director | sales_director, or null.
  - Visibility rule: `canSeeSolar = solarRole != null || isAdminLevel`. Fiber reps without a solar role see nothing.
- `solarLeads/{uid_clientId}`: contact fields, monthlyBill, creditTier (purchase_600 | lease_ppa_680), photos {billPage1, billGraph, panel} (storage paths), repUid, source (portal | knock), doorId?, campaignId?, status, createdAt.
- `solarAvailability/{consultantUid}`: { name, modes: { virtual: weekly[], in_person: weekly[] }, tz: America/Los_Angeles, slotMin: 60 }.
  - Seeds: owner in-person Mon 8-5, Tue/Thu/Fri 8-8. Owner virtual Mon 8-5, Tue 8-8, Wed 8-5, Thu 8-8, Fri 8-8, Sat 12-8. Jacob virtual = owner virtual.
- `solarBookings/{consultantUid_slotStartISO}`: created with `.create()`, so a slot that is already taken fails as already-exists and the API returns 409.
- Firestore rules: all three collections are `allow read, write: if false` (admin-SDK routes only, same as fiberReports).

## Phase 1: before 1pm
1. Port the idempotency helpers (src/lib/forms/idempotency.ts, submitForm.ts) from branch knock/report-dedupe 41dc42b0.
2. Add `solarRole` to the types, a `canSeeSolar` helper, and an admin user-edit dropdown so trainees can be given a role today.
3. `/portal/solar/present`: a full-screen deck that works on phone and tablet, with swipe and arrow keys.
   - Slide content comes from the pptx (text plus images exported).
   - Slide 4: the calculator.
   - Slide 5: the lead form with 3 photo slots (reuses /api/portal/forms/upload, formType `solar-lead`).
   - Slide 7: the prequal cards.
   - Slide 10: booking. Slide 11: confirmation. The remaining slides are static.
4. API routes (Bearer token, gated on canSeeSolar, formSubmit rate limit):
   - POST /api/portal/solar/leads (clientId dedupe; on a new lead, notify + email + push to leadAlertUids).
   - PATCH lead with creditTier.
   - GET /api/portal/solar/availability?mode&from&to.
   - POST /api/portal/solar/bookings (409 on a taken slot). Sends the customer a confirmation email and notifies the consultant.
5. Nav entry "Solar deck", shown only when canSeeSolar.
6. Gates: tsc, tests for the routes and the calculator, build. Then push to master (self-push OK) and tell Jacob the one page to open.

## Phase 2: after training
- Admin "Solar" settings: edit availability per consultant (and add consultants), alert recipients, slot length.
- Admin leads list with photo viewer and status. Rep "My solar leads".
- Reminder 1-2 h before a booking: a cron (Vercel) sends push + email to the consultant.
- Customer confirm link in the email (token, marks the booking confirmed).
- Solar promotion ladder thresholds + pay split as config (waiting on the owner's table).
- Sales Director visibility (open).

## Knock contract (send to the knock session once Phase 1 lands)
- Same Bearer ID token. Gate: the caller must have a solarRole or be admin.
- POST /api/portal/forms/upload (multipart: file, formType=solar-lead, uploadId, slot) -> folder path. The app retries each photo in its outbox, then posts the lead with the paths.
- POST /api/portal/solar/leads {clientId, first, last, address, city, state, zip, phone, email, monthlyBill, creditTier?, photos{billPage1,billGraph,panel}, doorId?, campaignId?}
  -> 200 {success, id}. A duplicate clientId returns 200 with the same id.
- PATCH /api/portal/solar/leads/{id} {creditTier}.
- GET /api/portal/solar/availability?mode=virtual|in_person&from=ISO&to=ISO -> {slots:[{consultantUid, name, start, end}]}.
- POST /api/portal/solar/bookings {leadId, mode, consultantUid, start} -> 200 {id} | 409 slot_taken.

## Open (owner/Jacob)
- Promotion thresholds + pay table (owner is sending them).
- Sales Director: who it is and what they see.
- In-person hours confirmation.
