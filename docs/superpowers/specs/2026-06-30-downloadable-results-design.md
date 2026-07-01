# Downloadable Form Results — Design

**Status:** approved (user 2026-06-30: "download the ones that make sense, like the application; all results in a list admins & managers can have").

## Goal
Let admins/managers download form submissions as a spreadsheet (CSV), and turn the
website Applications from a hidden dropdown into a proper browsable + downloadable
list. No third-party export — everything stays in the portal, gated to management.

## Scope (3 pieces)
1. **CSV core** — a pure, tested serializer + a browser-download helper.
2. **Rep-form review lists** — add a "Download CSV" button to the shared `ReviewList`
   component, so all four rep forms (Fiber Report, Expedite Order, Payroll Dispute,
   Leads Request) gain export for free, exporting exactly the columns each page defines.
3. **Applications list** — in the Recruiting Command Center, render website
   applications as a visible list (currently they only populate the invite dropdown)
   and add a "Download CSV" button for them.

## CSV core — `src/lib/export/csv.ts`
- `toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string`
  - Header row = the labels. Each data row = the columns' `key` values in order.
  - Values: `null`/`undefined` → empty; `Date` → ISO string; everything else → String().
  - RFC-4180 escaping: wrap a field in double quotes when it contains `"`, `,`, `\n`,
    or `\r`; double any embedded `"`. Rows joined with `\r\n`.
- `downloadCsv(filename: string, csv: string): void` (browser-only) — builds a
  `text/csv` Blob, an object URL, a temporary `<a download>`, clicks it, revokes the URL.
  Not unit-tested (DOM side-effect); kept trivial and isolated.

## ReviewList change
`ReviewList` already receives `title`, `columns`, `rows`. Add an optional
`downloadFilename?: string`. When present, render a "Download CSV" button in the header
panel (next to the "N new" badge) that calls
`downloadCsv(downloadFilename, toCsv(columns, rows))`. Disabled when `rows.length === 0`.
All four rep admin pages pass a `downloadFilename` (e.g. `payroll-disputes.csv`); no other
change needed on those pages. Backward-compatible: pages that omit it show no button.

## Applications list change
`src/app/portal/admin/recruiting/page.tsx` already loads `applications`
(name, phone, email, city, referredBy, status, createdAt). Add:
- A compact list/table of applications (name, city, phone, email, status, submitted)
  so managers can see the raw website leads, not just pick from a dropdown.
- A "Download CSV" button (filename `applications.csv`) using the same `toCsv` +
  `downloadCsv` helpers over an APPLICATION_COLUMNS definition.
The one-click "Use website application → create invite" flow is unchanged.

## Security / scope
- No new API routes. All data is already fetched by the existing management-gated
  admin pages; CSV is built client-side from what's already on screen. No new PII exposure.
- YAGNI: no PDF, no per-submission export, no cross-form mega-dashboard, no server
  streaming. Just CSV of the lists that already exist + surfacing Applications.

## Testing
- `csv.test.ts`: header from labels; key ordering; empty for null/undefined; Date→ISO;
  escaping of comma / quote / newline; embedded-quote doubling; empty-rows → header only.
