import { saveBlobViaApp, shouldSaveViaApp } from '@/lib/app/saveFile';

// Minimal RFC-4180 CSV serialization for exporting admin review lists. Pure and
// unit-tested; the DOM download side is a thin isolated helper below.
export interface CsvColumn {
  key: string;
  label: string;
}

function cell(value: unknown): string {
  let raw =
    value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  // Spreadsheets run text starting with = + - @ (or tab/CR) as a formula. Real
  // numbers stay as-is so negative values still export as numbers.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}

// Browser-only: save a Blob as a file. The object URL outlives the click so
// Safari (which starts the download asynchronously) can still read it.
// Inside the 3C iOS app the file goes to the native share sheet instead
// (SPEC A5); everywhere else this is the plain <a download>.
// Resolves true once the file is saved (or handed to the browser's download),
// false if the person cancelled the share sheet, and rejects when the save
// fails, so callers only say "Downloaded" after it really happened.
export async function downloadBlob(filename: string, blob: Blob): Promise<boolean> {
  if (shouldSaveViaApp()) return saveBlobViaApp(filename, blob);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

// Browser-only: trigger a client-side download of the given CSV text.
export function downloadCsv(filename: string, csv: string): Promise<boolean> {
  return downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}
