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
