'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
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
      <PortalPageHeader
        compact
        eyebrow="Review queue"
        title={title}
        actions={
          <>
            {downloadFilename && (
              <Button
                type="button"
                variant="outline"
                disabled={rows.length === 0}
                onClick={() => downloadCsv(downloadFilename, toCsv(columns, rows))}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10"
              >
                Download CSV
              </Button>
            )}
            <span
              className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                pending > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
              }`}
            >
              {pending} new
            </span>
          </>
        }
      />

      {error && (
        <div className="portal-enter portal-enter-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">{error}</div>
      )}

      {loading ? (
        <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm dark:border-border dark:bg-card">
          <CardContent className="py-8">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
            <p className="mt-4 text-sm text-slate-500 dark:text-muted-foreground">Loading…</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm dark:border-border dark:bg-card">
          <CardContent className="py-12">
            <h3 className="font-semibold text-slate-950 dark:text-foreground">Nothing to review</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">No submissions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="portal-enter portal-enter-2 space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
              <CardContent className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {columns.map((col) => (
                      <div key={col.key}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">{col.label}</p>
                        <p className="mt-1 text-sm font-medium text-slate-950 dark:text-foreground">{formatValue(row[col.key])}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.status === 'handled' ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
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
