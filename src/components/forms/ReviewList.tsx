'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toCsv, downloadCsv } from '@/lib/export/csv';

interface ReviewRow {
  id: string;
  status: string;
  [key: string]: unknown;
}
interface ReviewColumn {
  key: string;
  label: string;
}
interface ReviewListProps {
  title: string;
  columns: ReviewColumn[];
  rows: ReviewRow[];
  onMarkHandled: (id: string) => void;
  loading?: boolean;
  error?: string;
  downloadFilename?: string;
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(v);
}

export default function ReviewList({
  title,
  columns,
  rows,
  onMarkHandled,
  loading = false,
  error = '',
  downloadFilename,
}: ReviewListProps) {
  const pending = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <div className="flex items-center gap-2">
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
            <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              {pending} new
            </Badge>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
          <CardContent className="py-8">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
          <CardContent className="py-12">
            <h3 className="font-semibold text-slate-950">Nothing to review</h3>
            <p className="mt-1 text-sm text-slate-500">No submissions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {columns.map((col) => (
                      <div key={col.key}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{col.label}</p>
                        <p className="mt-1 text-sm font-medium text-slate-950">{formatValue(row[col.key])}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.status === 'handled' ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Handled
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => onMarkHandled(row.id)}
                        className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                      >
                        Mark handled
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
