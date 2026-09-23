'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Download, FileText, Paperclip, PenLine } from 'lucide-react';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import rep from '@/components/portal/rep/rep.module.css';
import {
  AdminHead,
  AdminSearch,
  AdminSelect,
  AdminSheet,
  EmptyState,
  LoadFailed,
  Seg,
  SkeletonRows,
  StatusDot,
  cx,
} from './AdminKit';
import s from './admin-ops.module.css';

/**
 * The one review queue behind every admin form inbox (bug reports, expedite
 * orders, fiber reports, leads requests, manager interviews, payroll disputes):
 * list → detail sheet → mark handled. Stacked rows on phones, a table on
 * desktop. Pages map their submissions into QueueRow; the queue owns search,
 * filters, CSV export and the detail sheet.
 */

export interface QueueEvidence {
  label: string;
  /** Must open synchronously inside the click (iOS drops window.open after an await). */
  onClick: () => void;
}

export interface QueueField {
  label: string;
  value: string;
  /** Long text (details, reasons) spans the full sheet width. */
  wide?: boolean;
}

export interface QueueRow {
  id: string;
  status: 'new' | 'handled';
  person: string;
  personSub?: string;
  subject: string;
  subjectSub?: string;
  secondary: string;
  secondarySub?: string;
  evidenceKind: 'none' | 'files' | 'signature';
  evidenceItems?: QueueEvidence[];
  signatureUrl?: string;
  detailTitle?: string;
  detailFields: QueueField[];
  notes?: string;
  /** Precomputed lowercase haystack for the search box. */
  searchText: string;
  /** Value matched against the optional filter (campaign, provider). */
  filterValue?: string;
}

export interface QueueCsvColumn {
  key: string;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: Date, withTime: boolean): string {
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (!withTime) return date;
  return `${date} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Display formatter for submission values: '—' for blanks, readable dates, Yes/No. */
export function queueValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (v instanceof Date) return fmtDate(v, true);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return fmtDate(d, true);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, day] = v.split('-').map(Number);
    return fmtDate(new Date(y, m - 1, day), false);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-US');
  return String(v);
}

type StatusFilter = 'all' | 'new' | 'handled';
/** Queues open on what still needs handling (owner decision); All is one tap away. */
const DEFAULT_STATUS: StatusFilter = 'new';

export function AdminQueue({
  title,
  lede,
  columns,
  rows,
  loading,
  error,
  onRetry,
  onMarkHandled,
  itemNoun,
  searchPlaceholder = 'Search',
  filterLabel,
  filterOptions,
  downloadFilename,
  csvColumns,
  csvRows,
  emptyTitle = 'Nothing to review',
  emptyBody,
}: {
  title: string;
  lede?: string;
  /** Desktop column headings: [person, subject, secondary]. */
  columns: [string, string, string];
  rows: QueueRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  /** Rejects when the server refuses; the sheet says so. */
  onMarkHandled: (id: string) => Promise<void>;
  /** Singular noun for the sheet kicker ("Bug report"). */
  itemNoun: string;
  searchPlaceholder?: string;
  filterLabel?: string;
  filterOptions?: string[];
  downloadFilename?: string;
  csvColumns?: QueueCsvColumn[];
  csvRows?: Record<string, unknown>[];
  emptyTitle?: string;
  emptyBody: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const openCount = rows.filter((r) => r.status === 'new').length;
  const failed = !loading && Boolean(error);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (filterLabel && filter !== 'all' && row.filterValue !== filter) return false;
      if (q && !row.searchText.includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, filter, filterLabel]);

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const canExport = Boolean(downloadFilename && csvColumns && csvRows);
  const hasFilter = Boolean(filterLabel && filterOptions && filterOptions.length > 0);
  // Queues whose forms never carry files or signatures drop the empty Attached column.
  const hasEvidence = rows.some((r) => r.evidenceKind !== 'none');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter(DEFAULT_STATUS);
    setFilter('all');
  };

  let body: ReactNode;
  if (loading) body = <SkeletonRows rows={4} />;
  else if (failed) body = <LoadFailed onRetry={onRetry} />;
  else if (rows.length === 0) body = <EmptyState title={emptyTitle} body={emptyBody} />;
  // Default view with nothing left to handle: say so, not "Nothing matches".
  else if (statusFilter === 'new' && openCount === 0 && !search.trim() && filter === 'all')
    body = (
      <EmptyState
        title="Nothing waiting"
        body={`Every ${itemNoun.toLowerCase()} here is handled.`}
        action={
          <button type="button" className={s.btn} onClick={() => setStatusFilter('handled')}>
            Show handled
          </button>
        }
      />
    );
  else if (filtered.length === 0)
    body = (
      <EmptyState
        title="Nothing matches"
        body="Try a different search or filter."
        action={
          <button type="button" className={s.btn} onClick={clearFilters}>
            Clear filters
          </button>
        }
      />
    );
  else
    body = (
      <>
        <div className={s.qHead} aria-hidden="true">
          <span>{columns[0]}</span>
          <span>{columns[1]}</span>
          <span>{columns[2]}</span>
          {hasEvidence ? <span>Attached</span> : null}
          <span>Status</span>
          <span />
        </div>
        <ul className={s.qList}>
          {filtered.map((row) => (
            <li key={row.id}>
              <QueueRowButton row={row} onOpen={() => setOpenId(row.id)} />
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <div className={s.page}>
      <AdminHead
        title={title}
        lede={lede}
        count={loading || failed ? null : openCount}
        countLabel="open"
      />

      <div className={s.toolbar}>
        <AdminSearch value={search} onChange={setSearch} placeholder={searchPlaceholder} label={`Search ${title.toLowerCase()}`} />
        {hasFilter ? (
          <div className={s.filterSlot}>
            <AdminSelect value={filter} onChange={setFilter} label={`Filter by ${filterLabel!.toLowerCase()}`}>
              <option value="all">All {filterLabel!.toLowerCase()}s</option>
              {filterOptions!.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </AdminSelect>
          </div>
        ) : null}
        <div className={s.toolbarRow}>
          <Seg<StatusFilter>
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'new', label: 'New', count: loading || failed ? undefined : openCount },
              { value: 'handled', label: 'Handled' },
            ]}
          />
          {canExport ? (
            <button
              type="button"
              className={cx(s.btn, s.iconOnlyPhone)}
              disabled={!csvRows || csvRows.length === 0}
              onClick={() => downloadCsv(downloadFilename!, toCsv(csvColumns!, csvRows!))}
              aria-label="Export CSV"
            >
              <Download size={18} aria-hidden="true" />
              <span className={s.btnText}>Export CSV</span>
            </button>
          ) : null}
        </div>
      </div>

      <section className={cx(rep.panel, s.listPanel, !hasEvidence && s.qNoEv)} aria-label={title}>
        {body}
      </section>

      {openRow ? (
        <QueueSheet row={openRow} itemNoun={itemNoun} onClose={() => setOpenId(null)} onMarkHandled={onMarkHandled} />
      ) : null}
    </div>
  );
}

function evidenceSummary(row: QueueRow): ReactNode {
  if (row.evidenceKind === 'signature') {
    return (
      <>
        <PenLine size={14} aria-hidden="true" />
        Signature
      </>
    );
  }
  if (row.evidenceKind === 'files') {
    const n = row.evidenceItems?.length ?? 0;
    return (
      <>
        <Paperclip size={14} aria-hidden="true" />
        {n} file{n === 1 ? '' : 's'}
      </>
    );
  }
  return null;
}

function QueueRowButton({ row, onOpen }: { row: QueueRow; onOpen: () => void }) {
  const done = row.status === 'handled';
  return (
    <button type="button" className={cx(s.qRow, done && s.qDone)} onClick={onOpen} data-queue-open="">
      <span className={s.qWho}>
        <span className={s.qName}>{row.person}</span>
        {row.personSub && row.personSub !== '—' && row.personSub !== row.person ? (
          <span className={s.qSub}>{row.personSub}</span>
        ) : null}
      </span>
      <span className={s.qWhat}>
        <span className={s.qName}>{row.subject}</span>
        {row.subjectSub && row.subjectSub !== '—' ? <span className={s.qSub}>{row.subjectSub}</span> : null}
      </span>
      <span className={s.qWhen}>
        <span className={s.qName}>{row.secondary}</span>
        {row.secondarySub && row.secondarySub !== '—' ? <span className={s.qSub}>{row.secondarySub}</span> : null}
      </span>
      <span className={s.qEv}>{evidenceSummary(row)}</span>
      <span className={s.qStatus}>
        <StatusDot tone={done ? 'done' : 'new'}>{done ? 'Handled' : 'New'}</StatusDot>
      </span>
      <ChevronRight size={18} className={s.qChev} aria-hidden="true" />
    </button>
  );
}

function QueueSheet({
  row,
  itemNoun,
  onClose,
  onMarkHandled,
}: {
  row: QueueRow;
  itemNoun: string;
  onClose: () => void;
  onMarkHandled: (id: string) => Promise<void>;
}) {
  const labelId = useId();
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const done = row.status === 'handled';

  const markHandled = async () => {
    setSaving(true);
    setActionError('');
    try {
      await onMarkHandled(row.id);
    } catch {
      setActionError("Couldn't mark it handled. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSheet
      kicker={itemNoun}
      title={row.detailTitle ?? row.subject}
      labelId={labelId}
      onClose={onClose}
      footer={
        done ? (
          <p className={s.doneLine} style={{ margin: 0 }}>
            <Check size={18} aria-hidden="true" />
            Handled
          </p>
        ) : (
          <>
            {actionError ? (
              <p className={s.actionErr} role="alert">
                {actionError}
              </p>
            ) : null}
            <button type="button" className={cx(rep.btnPrimary, rep.btnBlock)} onClick={markHandled} disabled={saving}>
              {saving ? 'Saving…' : 'Mark handled'}
            </button>
          </>
        )
      }
    >
      <div className={s.detail}>
        <dl className={s.fields}>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusDot tone={done ? 'done' : 'new'}>{done ? 'Handled' : 'New'}</StatusDot>
            </dd>
          </div>
          <div>
            <dt>Submitted by</dt>
            <dd>
              {row.person}
              {row.personSub && row.personSub !== '—' && row.personSub !== row.person ? (
                <span className={s.ddSub}>{row.personSub}</span>
              ) : null}
            </dd>
          </div>
          {row.detailFields.map((field) => (
            <div key={field.label} className={field.wide || field.value.length > 42 ? s.fieldWide : undefined}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>

        {row.evidenceKind === 'files' && (row.evidenceItems?.length ?? 0) > 0 ? (
          <div className={s.section}>
            <p className={rep.kicker}>Attachments</p>
            <div className={s.evList}>
              {row.evidenceItems!.map((item) => (
                <button key={item.label} type="button" className={s.btn} onClick={item.onClick}>
                  <FileText size={16} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
            <p className={s.evNote}>Opens a signed link that expires in 15 minutes.</p>
          </div>
        ) : null}

        {row.evidenceKind === 'signature' && row.signatureUrl ? (
          <div className={s.section}>
            <p className={rep.kicker}>Signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.signatureUrl} alt="Captured signature" className={s.signature} />
          </div>
        ) : null}

        {row.notes ? (
          <div className={s.section}>
            <p className={rep.kicker}>Notes</p>
            <p className={s.notes}>{row.notes}</p>
          </div>
        ) : null}
      </div>
    </AdminSheet>
  );
}
