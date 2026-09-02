'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-a.css';
import { opsFormatValue } from '@/components/forms/OpsQueueList';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

type Row = Record<string, unknown> & { id: string; status: string; signatureDataUrl?: string };

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'candidateFirstName', label: 'Candidate' },
  { key: 'provider', label: 'Provider' },
  { key: 'jobPosition', label: 'Position' },
  { key: 'hiringManager', label: 'Manager' },
  { key: 'market', label: 'Market' },
  { key: 'didShow', label: 'Show?' },
  { key: 'extendOffer', label: 'Offer?' },
  { key: 'rating', label: 'Rating' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function ManagerInterviewsReviewPage() {
  const { user, isRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'handled'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  const load = useCallback(async () => {
    // ProtectedRoute only gates rendering — skip the fetch for roles that are
    // about to be redirected so unauthorized loads stay silent (no 403 noise).
    if (!user || !isRole('admin', 'operations')) return;
    try {
      const res = await authedFetch('/api/portal/forms/manager-interview/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, isRole, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/manager-interview/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => opsFormatValue(r.provider)).filter((c) => c !== '—'))).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.status === 'handled' ? 'handled' : 'new';
      const text = [row.repName, row.candidateFirstName, row.candidateLastName, row.provider].map(opsFormatValue).join(' ').toLowerCase();
      return (statusFilter === 'all' || status === statusFilter) && (providerFilter === 'all' || opsFormatValue(row.provider) === providerFilter) && (!q || text.includes(q));
    });
  }, [rows, search, statusFilter, providerFilter]);

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <PageTitle title="Manager Interviews" meta={`${rows.filter((row) => row.status !== 'handled').length} waiting`} subtitle="Review interview notes and record the next step." />
          <div className="ops-line-toolbar">
            <input type="search" className="ops-line-search" placeholder="Search interviews" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search interviews" />
            <div className="ops-line-segmented" role="group" aria-label="Status filter">{(['all', 'new', 'handled'] as const).map((value) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{value === 'all' ? 'All' : value === 'new' ? 'New' : 'Handled'}</button>)}</div>
            <select className="ops-line-select" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} aria-label="Filter by provider"><option value="all">All providers</option>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select>
            <button type="button" className="ops-line-export" onClick={() => downloadCsv('manager-interviews.csv', toCsv(COLUMNS, rows))}>Export CSV</button>
          </div>
          {error && <div className="ops-line-error-banner">{error}</div>}
          {loading ? <div className="ops-line-state-card">Loading interviews…</div> : filteredRows.length === 0 ? <div className="ops-line-state-card"><strong>{rows.length ? 'No interviews match this view.' : 'Nothing to review.'}</strong></div> : <div className="ops-line-list">{filteredRows.map((row) => {
            const expanded = expandedId === row.id;
            const candidate = `${opsFormatValue(row.candidateFirstName)} ${opsFormatValue(row.candidateLastName)}`.trim();
            return <article key={row.id} className={`ops-line-row${row.status === 'handled' ? ' done' : ' new'}`}>
              <button type="button" className="ops-line-row-main" onClick={() => setExpandedId(expanded ? null : row.id)} aria-expanded={expanded}>
                <span className="ops-line-person ops-line-cell"><span className="ops-line-avatar">{opsFormatValue(row.repName).charAt(0)}</span><span><strong>{opsFormatValue(row.repName)}</strong><small>{opsFormatValue(row.hiringManager)}</small></span></span>
                <span className="ops-line-cell"><strong>{opsFormatValue(row.jobPosition)}</strong><small>{candidate}</small></span>
                <span className="ops-line-cell"><strong>{opsFormatValue(row.provider)}</strong><small>{opsFormatValue(row.market)}</small></span>
                <span className="ops-line-status-chip">{row.status === 'handled' ? 'handled' : 'new'}</span><span className="ops-line-chevron">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && (
                <div className="ops-line-detail-panel">
                  <div className="ops-line-detail-copy">
                    <h3>{opsFormatValue(row.jobPosition)} interview</h3>
                    <div className="ops-line-detail-fields">
                      <div><span>Hiring manager</span><b>{opsFormatValue(row.hiringManager)}</b></div>
                      <div><span>Did show</span><b>{opsFormatValue(row.didShow)}</b></div>
                      <div><span>Offer</span><b>{opsFormatValue(row.extendOffer)}</b></div>
                      <div><span>Rating</span><b>{opsFormatValue(row.rating)}</b></div>
                    </div>
                    {row.signatureDataUrl && (
                      <>
                        <span className="sr-only">Captured signature</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.signatureDataUrl} alt="Captured signature" className="sweep-signature" />
                      </>
                    )}
                    {row.status !== 'handled' && <button type="button" className="ops-line-action resolve" onClick={() => void markHandled(row.id)}>Mark handled</button>}
                  </div>
                </div>
              )}
            </article>;
          })}</div>}
        </div>
      </div>
    </ProtectedRoute>
  );
}
