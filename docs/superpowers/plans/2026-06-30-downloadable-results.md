# Downloadable Form Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV download to the form review lists and surface website Applications as a visible, downloadable list in the Recruiting Command Center.

**Architecture:** A pure, unit-tested CSV serializer + a tiny browser-download helper. The shared `ReviewList` gains an optional Download button so all 4 rep forms get export at once. The recruiting page renders applications as a list with its own download.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints
- No new API routes; CSV is built client-side from data already fetched by existing management-gated pages. No new PII exposure.
- CSV must be RFC-4180 correct: quote fields containing `"` `,` `\n` `\r`; double embedded quotes; rows joined with `\r\n`.
- Backward-compatible: `ReviewList` without the new prop shows no button and behaves exactly as today.
- Follow existing file/naming/style conventions (see referenced pattern files).

---

### Task 1: CSV core (pure + tested)

**Files:**
- Create: `src/lib/export/csv.ts`
- Test: `src/lib/export/csv.test.ts`

**Interfaces:**
- Produces: `toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string`; `downloadCsv(filename: string, csv: string): void`.

- [ ] **Step 1: Write the failing test** `src/lib/export/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

const cols = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
];

describe('toCsv', () => {
  it('emits a header row from labels', () => {
    expect(toCsv(cols, [])).toBe('Name,City');
  });
  it('emits values in column-key order', () => {
    expect(toCsv(cols, [{ city: 'Dallas', name: 'Jane' }])).toBe('Name,City\r\nJane,Dallas');
  });
  it('renders null/undefined/missing as empty', () => {
    expect(toCsv(cols, [{ name: null, city: undefined }])).toBe('Name,City\r\n,');
  });
  it('serializes Date as ISO', () => {
    const d = new Date('2026-06-30T12:00:00.000Z');
    expect(toCsv([{ key: 'when', label: 'When' }], [{ when: d }])).toBe('When\r\n2026-06-30T12:00:00.000Z');
  });
  it('quotes and escapes commas, quotes, and newlines', () => {
    const rows = [{ name: 'Doe, John', city: 'a "b" c' }];
    expect(toCsv(cols, rows)).toBe('Name,City\r\n"Doe, John","a ""b"" c"');
  });
  it('quotes fields containing newlines', () => {
    expect(toCsv([{ key: 'n', label: 'N' }], [{ n: 'line1\nline2' }])).toBe('N\r\n"line1\nline2"');
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/lib/export/csv.test.ts` (module missing).

- [ ] **Step 3: Implement** `src/lib/export/csv.ts`:

```ts
// Minimal RFC-4180 CSV serialization for exporting admin review lists. Pure and
// unit-tested; the DOM download side is a thin isolated helper below.
export interface CsvColumn {
  key: string;
  label: string;
}

function cell(value: unknown): string {
  const raw =
    value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}

// Browser-only: trigger a client-side download of the given CSV text.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests, verify PASS** — `npx vitest run src/lib/export/csv.test.ts`.

- [ ] **Step 5: Commit** — `git add src/lib/export/csv.ts src/lib/export/csv.test.ts && git commit -m "feat: CSV export core (toCsv + downloadCsv)"`

---

### Task 2: Download button on the shared ReviewList

**Files:**
- Modify: `src/components/forms/ReviewList.tsx`
- Modify: `src/app/portal/admin/payroll-disputes/page.tsx`
- Modify: `src/app/portal/admin/leads-requests/page.tsx`
- Modify: `src/app/portal/admin/expedite-orders/page.tsx`
- Modify: `src/app/portal/admin/fiber-reports/page.tsx`

**Interfaces:**
- Consumes: `toCsv`, `downloadCsv` from Task 1.
- Produces: `ReviewList` optional prop `downloadFilename?: string`.

- [ ] **Step 1: Update `ReviewList.tsx`.** Add `downloadFilename?: string` to `ReviewListProps`. Import `{ toCsv, downloadCsv } from '@/lib/export/csv'`. In the header panel (the `<section>` that holds the title + "N new" badge), when `downloadFilename` is set, render a "Download CSV" button before/after the badge:

```tsx
{downloadFilename && (
  <Button
    type="button"
    variant="outline"
    disabled={rows.length === 0}
    onClick={() => downloadCsv(downloadFilename, toCsv(columns, rows))}
  >
    Download CSV
  </Button>
)}
```

Place it inside the existing flex row so it sits alongside the badge. `Button` is already imported. Keep everything else unchanged.

- [ ] **Step 2: Wire the four admin pages.** Each already renders `<ReviewList title=... columns=... rows=... onMarkHandled=... />`. Add one prop to each:
  - `src/app/portal/admin/payroll-disputes/page.tsx`: `downloadFilename="payroll-disputes.csv"`
  - `src/app/portal/admin/leads-requests/page.tsx`: `downloadFilename="leads-requests.csv"`
  - `src/app/portal/admin/expedite-orders/page.tsx`: `downloadFilename="expedite-orders.csv"`
  - `src/app/portal/admin/fiber-reports/page.tsx`: `downloadFilename="fiber-reports.csv"`

  (First read each file to confirm it uses `ReviewList`; if any page uses a bespoke table instead of `ReviewList`, note it in your report and add the same Download CSV button inline using `toCsv`/`downloadCsv` over that page's columns+rows rather than forcing `ReviewList`.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Run suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 5: Commit** — `git add src/components/forms/ReviewList.tsx src/app/portal/admin && git commit -m "feat: Download CSV on rep-form review lists"`

---

### Task 3: Applications list + download in Recruiting Command Center

**Files:**
- Modify: `src/app/portal/admin/recruiting/page.tsx`

**Interfaces:**
- Consumes: `toCsv`, `downloadCsv`; the existing `applications` state (`ApplicationRecord[]`).

- [ ] **Step 1: Read the file** to locate the `applications` state and where the invite form's dropdown renders (around the "Use website application" select). The applications list should render as its own card/section near that form, without disturbing the invite flow.

- [ ] **Step 2: Add an applications columns constant** near the top-level consts (after `emptyForm`):

```ts
const APPLICATION_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Submitted' },
];
```

- [ ] **Step 3: Add the import** — `import { toCsv, downloadCsv } from '@/lib/export/csv';`.

- [ ] **Step 4: Render a Website Applications card** — a new `Card` (matching the existing card styling in this file) placed in the layout after the "Start Recruit Onboarding" card (or as a full-width section below the grid). It contains:
  - A header row with the title "Website Applications" and a "Download CSV" `Button` (`variant="outline"`, `disabled={applications.length === 0}`, `onClick={() => downloadCsv('applications.csv', toCsv(APPLICATION_COLUMNS, applications as unknown as Record<string, unknown>[]))}`).
  - A simple responsive list: for each application, show name, city, phone, email, a status `Badge`, and the submitted date. If `applications.length === 0`, show a muted "No website applications yet." line.
  - Use the file's existing `Card`/`CardContent`/`Badge` imports and Tailwind classes for visual consistency. Do NOT change the invite form or the dropdown.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 6: Build** — `npm run build`. Expected: green.

- [ ] **Step 7: Run suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 8: Commit** — `git add src/app/portal/admin/recruiting/page.tsx && git commit -m "feat: website applications list + CSV download in recruiting center"`

---

## Self-Review Notes
- Spec coverage: Task 1 (CSV core), Task 2 (rep-form downloads via shared component), Task 3 (applications list + download). Covers all three spec pieces.
- No new API routes / no new PII surface — CSV built from already-fetched, already-gated data.
- Backward-compat: `ReviewList` without `downloadFilename` is unchanged.
