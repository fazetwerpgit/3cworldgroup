# Editable Form Options — Design

**Status:** approved (user 2026-06-30). Build BEFORE the Manager Final Interview form.

## Goal
Let admins edit the dropdown option lists used by the rebuilt portal forms —
managers, markets, campaigns, providers, job positions, expedite reasons — from an
admin screen, without a developer. Hardcoded lists become editable defaults. This is
the real Formstack-replacement capability: self-service control over the forms.

## Principle: defaults in code, overrides in the database
- The existing arrays in `src/lib/forms/formOptions.ts` stay as **DEFAULTS** — always
  present, so nothing ever breaks if the DB has no override.
- A Firestore store holds **OVERRIDES**. When an override exists for a key, it wins;
  otherwise the code default is used. `resolved = override ?? default`.
- Both the client (render) and the server (validation) resolve the same way, so a
  submission is always validated against exactly what the rep saw.

## Option registry — the editable keys
A single registry maps a stable key → its default list + human label:

| key | label | default source |
|---|---|---|
| `providers` | Internet Providers | `FIBER_COMPANIES` |
| `expediteReasons` | Expedite Reasons | `EXPEDITE_REASONS` |
| `payrollCampaigns` | Payroll Campaigns | `PAYROLL_CAMPAIGNS` |
| `leadsCampaigns` | Leads: Campaigns | `LEADS_CAMPAIGNS` |
| `leadsManagers` | Leads: Managers | `['Jacob Myers']` (corrected) |
| `leadsLocations` | Leads: Locations | `LEADS_LOCATIONS` |
| `hireManagers` | Hire: Managers | `['Jacob Myers','Will Teasdale','Jeremy McFarland']` |
| `hireJobPositions` | Hire: Job Positions | `['Account Executive','L1 Manager','L2 Manager']` |
| `hireMarkets` | Hire: Markets | `[]` (user fills in later) |

**Deliberately NOT editable in v1 (logic-bearing):** `LEADS_CATEGORIES` and
`LEADS_REASONS`. These strings drive the Leads form's conditional show/hide
(`leadsConditions`), so renaming a label would silently break which uploads appear.
They stay code-defined. The admin screen shows them read-only with a short note.

## Data corrections baked into the new defaults
- **"Jordan Zuber" removed everywhere; replaced by "Jacob Myers".**
- **Leads managers default = just `Jacob Myers`.**
- **Hire managers default = Jacob Myers, Will Teasdale, Jeremy McFarland** (no title prefixes).
- **Hire job positions default = the app's real roles** (Account Executive / L1 Manager
  / L2 Manager), not Formstack's "Tam leader / Veteran Status".
- **Hire markets default = empty** — user supplies the correct list via the editor.

## Components
1. **Registry + resolver (`src/lib/forms/formOptionsRegistry.ts`, server-safe).**
   - `FORM_OPTION_DEFAULTS: Record<OptionKey, string[]>`, `FORM_OPTION_LABELS: Record<OptionKey,string>`, `OPTION_KEYS: OptionKey[]`.
   - `mergeOptions(overrides: Partial<Record<OptionKey,string[]>>): Record<OptionKey,string[]>`
     — pure: for each key, `overrides[key] ?? default`. Unit-tested.
2. **Server resolver (`src/lib/forms/resolveFormOptions.ts`).**
   - `getResolvedFormOptions(): Promise<Record<OptionKey,string[]>>` — reads the
     Firestore `formOptions` doc(s), calls `mergeOptions`. Used by submit routes.
   - Submit-route validation switches from importing the hardcoded array to
     `(await getResolvedFormOptions())[key]` + existing `isValidOption`.
3. **Read API (`GET /api/portal/forms/options`).** Verified-user gated; returns the
   resolved lists as JSON. Consumed by client form pages.
4. **Admin write API (`PUT /api/portal/forms/options`).** `requireVerifiedAdmin`
   (admins only). Body: `{ key, values }`; validates key ∈ editable keys, values is a
   string[] of trimmed non-empty entries (dedup, cap length/count). Writes the override.
5. **Client hook (`src/hooks/useFormOptions.ts`).** `useFormOptions()` fetches the
   read API once, returns `{ options, loading }`. Form pages read
   `options.leadsManagers` etc. instead of the imported constant, falling back to the
   code default while loading (so the form is never empty).
6. **Admin editor page (`/portal/admin/form-options`).** Admin-only. Lists each
   editable key with its label and current values as editable chips/lines (add/remove/
   reorder-optional), Save per list → PUT. Read-only display of the logic-bearing lists
   with a note. Nav entry under Admin.

## Firestore
`match /formOptions/{key} { allow read, write: if false; }` — server-only (Admin SDK);
the read API and admin write API mediate all access. Deny-all direct client access.

## Security / scope
- Editing is admin-only (verified token). Reading resolved options requires a verified
  user (the lists aren't secret, but keep them behind auth like the rest of the portal).
- Submit routes validate against the RESOLVED list — an admin removing an option
  immediately makes it invalid server-side too. No trusting client input.
- YAGNI: no per-user options, no versioning/history, no drag-reorder if costly (plain
  add/remove is fine), no editing of Yes/No or the 1–5 rating (those are fixed widgets).

## Testing
- `mergeOptions`: override wins; missing override → default; unknown keys ignored;
  empty-array override is respected (admin can clear a list).
- write-API validation: rejects non-editable keys, non-string values, empties; trims +
  dedupes.
- resolver: with no Firestore doc returns all defaults; with a partial override merges.
