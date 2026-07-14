'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, PenLine } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/export/csv';

export interface OpsQueueEvidenceItem {
  label: string;
  onClick: () => void;
}

export interface OpsQueueDetailField {
  label: string;
  value: string;
}

export interface OpsQueueRowVM {
  id: string;
  status: 'new' | 'handled';
  person: string;
  personSub?: string;
  subject: string;
  subjectSub?: string;
  secondary: string;
  secondarySub?: string;
  /** 'none' renders no evidence slot at all (honest — never a fabricated chip). */
  evidenceKind: 'none' | 'files' | 'signature';
  evidenceItems?: OpsQueueEvidenceItem[];
  signatureUrl?: string;
  detailFields: OpsQueueDetailField[];
  notes?: string;
  /** Precomputed lowercase haystack for the search box. */
  searchText: string;
  /** Value matched against the optional filter pill row (e.g. campaign). */
  filterValue?: string;
}

export interface OpsQueueCsvColumn {
  key: string;
  label: string;
}

/** Shared value formatter for detail-field/subtext strings across all 6 queue pages. */
export function opsFormatValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

interface OpsQueueListProps {
  kicker: string;
  heroWord: string;
  heroRest: string;
  intro: string;
  itemsLabel: string;
  rows: OpsQueueRowVM[];
  loading?: boolean;
  error?: string;
  downloadFilename?: string;
  csvColumns?: OpsQueueCsvColumn[];
  csvRows?: Record<string, unknown>[];
  /** Omit to ship no filter row at all — queues with no real closed-enum field get none. */
  filterLabel?: string;
  filterOptions?: string[];
  onMarkHandled: (id: string) => void;
  emptyStateTitle: string;
  emptyStateBody: string;
}

type StatusFilter = 'all' | 'new' | 'handled';

export default function OpsQueueList({
  kicker,
  heroWord,
  heroRest,
  intro,
  itemsLabel,
  rows,
  loading = false,
  error = '',
  downloadFilename,
  csvColumns,
  csvRows,
  filterLabel,
  filterOptions,
  onMarkHandled,
  emptyStateTitle,
  emptyStateBody,
}: OpsQueueListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [secondaryFilter, setSecondaryFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const heroCount = rows.filter((r) => r.status === 'new').length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (filterLabel && secondaryFilter !== 'all' && row.filterValue !== secondaryFilter) return false;
      if (q && !row.searchText.includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, secondaryFilter, filterLabel]);

  const handleExport = () => {
    if (!downloadFilename || !csvColumns || !csvRows) return;
    downloadCsv(downloadFilename, toCsv(csvColumns, csvRows));
  };

  return (
    <div>
      <div className="ops-line-ticker">
        <b>ON AIR</b>
        <span>Ops signal / {kicker.split('/').pop()?.trim() ?? 'queue relay'}</span>
        <strong>QUEUE LIVE</strong>
      </div>

      <div className="ops-line-hero">
        <div>
          <p className="ops-line-kicker">{kicker}</p>
          <h1>
            <span>{heroWord}</span>
            <br />
            {heroRest}
          </h1>
          <p className="ops-line-intro">{intro}</p>
        </div>
        <div className="ops-line-hero-count">
          <strong className="ops-line-display portal-metallic-num">{heroCount}</strong>
          <small>{itemsLabel}</small>
        </div>
      </div>

      <div className="ops-line-toolbar">
        <input
          type="search"
          className="ops-line-search"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search this queue"
        />
        <div className="ops-line-segmented" role="group" aria-label="Status filter">
          {(['all', 'new', 'handled'] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {value === 'all' ? 'All' : value === 'new' ? 'New' : 'Handled'}
            </button>
          ))}
        </div>
        {downloadFilename && csvColumns && csvRows && (
          <button
            type="button"
            className="ops-line-export"
            disabled={csvRows.length === 0}
            onClick={handleExport}
          >
            Export CSV
          </button>
        )}
      </div>

      {filterLabel && filterOptions && filterOptions.length > 0 && (
        <div className="ops-line-filter-line">
          <span>{filterLabel}</span>
          <div className="ops-line-pill-row" role="group" aria-label={`${filterLabel} filter`}>
            <button type="button" aria-pressed={secondaryFilter === 'all'} onClick={() => setSecondaryFilter('all')}>
              All
            </button>
            {filterOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={secondaryFilter === opt}
                onClick={() => setSecondaryFilter(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
          <span className="ops-line-filter-count">{filteredRows.length} items</span>
        </div>
      )}

      {error && <div className="ops-line-error-banner">{error}</div>}

      {loading ? (
        <div className="ops-line-state-card">Loading…</div>
      ) : filteredRows.length === 0 ? (
        <div className="ops-line-state-card">
          <p style={{ fontWeight: 900, marginBottom: 4 }}>
            {rows.length === 0 ? emptyStateTitle : 'No rows match this view.'}
          </p>
          <p>{rows.length === 0 ? emptyStateBody : 'Try clearing search or filters.'}</p>
        </div>
      ) : (
        <div className="ops-line-list">
          {filteredRows.map((row) => {
            const expanded = expandedId === row.id;
            const rowClass = [
              'ops-line-row',
              row.status === 'new' ? 'new' : '',
              row.status === 'handled' ? 'done' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <article key={row.id} className={rowClass}>
                <button
                  type="button"
                  className={`ops-line-row-main${row.evidenceKind === 'none' ? ' no-evidence' : ''}`}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  aria-expanded={expanded}
                >
                  <span className="ops-line-person ops-line-cell">
                    <span className="ops-line-avatar">
                      {row.person
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>{row.person}</strong>
                      {row.personSub && <small>{row.personSub}</small>}
                    </span>
                  </span>
                  <span className="ops-line-cell">
                    <strong>{row.subject}</strong>
                    {row.subjectSub && <small>{row.subjectSub}</small>}
                  </span>
                  <span className="ops-line-cell">
                    <strong>{row.secondary}</strong>
                    {row.secondarySub && <small>{row.secondarySub}</small>}
                  </span>
                  {row.evidenceKind !== 'none' && (
                    <span className="ops-line-evidence-group">
                      {row.evidenceKind === 'signature' ? (
                        <span className="ops-line-evidence-chip">
                          <span className="ops-line-thumb"><PenLine size={11} /></span>
                          Signature
                        </span>
                      ) : (
                        (row.evidenceItems ?? []).map((item) => (
                          <span key={item.label} className="ops-line-evidence-chip">
                            <span className="ops-line-thumb"><FileText size={11} /></span>
                            {item.label}
                          </span>
                        ))
                      )}
                    </span>
                  )}
                  <span className={`ops-line-status-chip${row.status === 'handled' ? ' handled' : ''}`}>
                    {row.status === 'handled' ? 'handled' : 'new'}
                  </span>
                  <span className="ops-line-chevron">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>

                {expanded && (
                  <div className="ops-line-detail-panel">
                    {row.evidenceKind === 'none' ? (
                      <div className="ops-line-no-evidence">No evidence attached to this submission.</div>
                    ) : row.evidenceKind === 'signature' && row.signatureUrl ? (
                      <div className="ops-line-proof-preview">
                        <div className="ops-line-proof-top">
                          <span>SIGNATURE</span>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.signatureUrl} alt="Captured signature" />
                      </div>
                    ) : (
                      <div className="ops-line-proof-preview">
                        <div className="ops-line-proof-top">
                          <span>EVIDENCE</span>
                        </div>
                        <h4>{row.secondary}</h4>
                        <p>
                          {(row.evidenceItems ?? []).length} file
                          {(row.evidenceItems ?? []).length === 1 ? '' : 's'} attached · opens a signed link, expires
                          in 15 minutes.
                        </p>
                        <div className="ops-line-evidence-group" style={{ marginTop: 12 }}>
                          {(row.evidenceItems ?? []).map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              className="ops-line-evidence-chip"
                              onClick={item.onClick}
                            >
                              <span className="ops-line-thumb"><FileText size={11} /></span>
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="ops-line-detail-copy">
                      <h3>
                        {row.person} / {row.subject}
                      </h3>
                      <div className="ops-line-detail-fields">
                        {row.detailFields.map((field) => (
                          <div key={field.label}>
                            <span>{field.label}</span>
                            <b>{field.value}</b>
                          </div>
                        ))}
                      </div>
                      {row.notes && (
                        <textarea className="ops-line-notes" readOnly value={row.notes} aria-label="Notes" />
                      )}
                      <div className="ops-line-detail-actions">
                        {row.status === 'new' ? (
                          <button type="button" className="ops-line-action resolve" onClick={() => onMarkHandled(row.id)}>
                            Resolve
                          </button>
                        ) : (
                          <span className="ops-line-status-chip handled">Handled</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
