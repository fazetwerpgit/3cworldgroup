'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Download } from 'lucide-react';
import { AdminSearch, AdminSelect, ConfirmStrip, Seg, cx } from '@/components/portal/admin-ops/AdminKit';
import { AdminEmpty, AdminFailed, AdminNotice, AdminSkeletonRows, StatusDot } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { SOLAR_HUB, hubTabHref } from '@/components/portal/admin-d/adminHubs';
import { useOpsQueues } from '@/components/portal/admin-d/opsQueues';
import { LeadDetail } from '@/components/portal/solar/LeadDetail';
import {
  CREDIT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  billLine,
  consultTime,
  leadName,
  leadPlace,
  modeLabel,
  savedDate,
} from '@/components/portal/solar/leadDisplay';
import {
  cancelBooking,
  fetchLeads,
  setLeadStatus,
  type SolarLeadStatus,
  type SolarLeadView,
} from '@/components/portal/solar/solarClient';
import { useFirstReveal } from '@/hooks/useFirstReveal';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import rep from '@/components/portal/rep/rep.module.css';
import ops from '@/components/portal/admin-ops/admin-ops.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import css from '@/components/portal/solar/solar-leads.module.css';

type View = 'open' | 'sold' | 'lost' | 'all';

const IN_VIEW: Record<View, (status: SolarLeadStatus) => boolean> = {
  open: (status) => status === 'new' || status === 'booked',
  sold: (status) => status === 'sold',
  lost: (status) => status === 'lost',
  all: () => true,
};

const CSV_COLUMNS = [
  { key: 'first', label: 'First name' },
  { key: 'last', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'monthlyBill', label: 'Monthly bill' },
  { key: 'credit', label: 'Credit' },
  { key: 'status', label: 'Status' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'consultType', label: 'Consultation type' },
  { key: 'consultant', label: 'Consultant' },
  { key: 'repName', label: 'Rep' },
  { key: 'source', label: 'Source' },
  { key: 'saved', label: 'Saved' },
];

function csvRow(lead: SolarLeadView): Record<string, unknown> {
  return {
    ...lead,
    monthlyBill: lead.monthlyBill ?? '',
    credit: lead.creditTier ? CREDIT_LABEL[lead.creditTier] : '',
    status: STATUS_LABEL[lead.status],
    consultation: lead.booking ? consultTime(lead.booking) : '',
    consultType: lead.booking ? modeLabel(lead.booking.mode) : '',
    consultant: lead.booking?.consultantName ?? '',
    source: lead.source === 'knock' ? '3C Doors' : 'Solar deck',
    saved: savedDate(lead.createdAt),
  };
}

function haystack(lead: SolarLeadView): string {
  return [lead.first, lead.last, lead.phone, lead.phone.replace(/\D/g, ''), lead.email, lead.address, lead.city, lead.zip]
    .join(' ')
    .toLowerCase();
}

/**
 * Admin Solar > Leads: every homeowner a rep saved from the deck or 3C Doors,
 * with the consultation. Open (not booked + booked) by default; a row opens the
 * lead's sheet, which marks it sold or lost, reopens it, or cancels the
 * booking. ?lead={id} (the lead alert's link) opens that lead's sheet.
 */
export default function SolarLeads() {
  const router = useRouter();
  const linkedLead = useSearchParams().get('lead');
  const { refresh: refreshBadges } = useOpsQueues();

  const [leads, setLeads] = useState<SolarLeadView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('open');
  const [repFilter, setRepFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  const load = useCallback(async (background = false) => {
    const res = await fetchLeads();
    if (res.ok) {
      setLeads(res.data.leads);
      setFailed(false);
    } else if (!background) {
      // A background refresh that fails keeps the list on screen.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // The first read lands asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useRefreshOnResume(() => load(true));

  // The alert's link: open that lead once the list has it, under a filter
  // that shows it, so closing the sheet leaves it in view.
  const linkedOnce = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedLead || !leads || linkedOnce.current === linkedLead) return;
    linkedOnce.current = linkedLead;
    const lead = leads.find((l) => l.id === linkedLead);
    if (!lead) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time jump from the link
    if (!IN_VIEW[view](lead.status)) setView('all');
    setOpenId(lead.id);
  }, [linkedLead, leads, view]);

  const closeSheet = () => {
    setOpenId(null);
    if (linkedLead) router.replace(hubTabHref(SOLAR_HUB, 'leads'), { scroll: false });
  };

  const reps = useMemo(() => {
    const byUid = new Map<string, string>();
    for (const lead of leads ?? []) if (lead.repUid) byUid.set(lead.repUid, lead.repName || 'Unknown rep');
    return [...byUid.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      (leads ?? []).filter(
        (lead) =>
          IN_VIEW[view](lead.status) &&
          (repFilter === 'all' || lead.repUid === repFilter) &&
          (!q || haystack(lead).includes(q))
      ),
    [leads, view, repFilter, q]
  );
  const openCount = leads?.filter((lead) => IN_VIEW.open(lead.status)).length;
  const reveal = useFirstReveal('3c:reveal:solar-leads', !!leads && leads.length > 0);
  const openLead = openId ? (leads?.find((lead) => lead.id === openId) ?? null) : null;

  const patchLead = (id: string, patch: Partial<SolarLeadView>) => {
    setLeads((prev) => prev?.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)) ?? prev);
    refreshBadges();
  };

  const exportCsv = async () => {
    setExportError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsv(`solar-leads-${date}.csv`, toCsv(CSV_COLUMNS, shown.map(csvRow)));
    } catch {
      setExportError("Couldn't save the CSV. Try again.");
    }
  };

  const clearFilters = () => {
    setSearch('');
    setRepFilter('all');
    setView('open');
  };

  let body: ReactNode;
  if (failed && !leads) {
    body = (
      <AdminFailed
        what="solar leads"
        onRetry={() => {
          setFailed(false);
          void load();
        }}
      />
    );
  } else if (!leads) {
    body = <AdminSkeletonRows rows={4} label="Loading solar leads" />;
  } else if (leads.length === 0) {
    body = (
      <AdminEmpty title="No solar leads yet">
        A lead shows here as soon as a rep saves a homeowner from the deck or 3C Doors.
      </AdminEmpty>
    );
  } else if (shown.length === 0) {
    const nothingOpen = view === 'open' && !q && repFilter === 'all';
    body = nothingOpen ? (
      <AdminEmpty
        title="Nothing open"
        action={
          <button type="button" className={ops.btn} onClick={() => setView('all')}>
            Show all leads
          </button>
        }
      >
        Every lead here is sold or lost.
      </AdminEmpty>
    ) : (
      <AdminEmpty
        title="Nothing matches"
        action={
          <button type="button" className={ops.btn} onClick={clearFilters}>
            Clear filters
          </button>
        }
      >
        Try a different search, rep or filter.
      </AdminEmpty>
    );
  } else {
    body = (
      <>
        <div className={css.head} aria-hidden="true">
          <span>Homeowner</span>
          <span>Rep</span>
          <span>Bill</span>
          <span>Consultation</span>
          <span>Status</span>
          <span />
        </div>
        <ul className={css.list} data-reveal={reveal || undefined}>
          {shown.map((lead, index) => (
            <li key={lead.id} style={{ '--i': index } as CSSProperties}>
              <LeadRow lead={lead} onOpen={() => setOpenId(lead.id)} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className={ops.page}>
      {exportError ? (
        <AdminNotice tone="error" onDismiss={() => setExportError('')}>
          {exportError}
        </AdminNotice>
      ) : null}

      <div className={ops.toolbar}>
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder="Search name, phone, email or address"
          label="Search solar leads"
        />
        {reps.length > 1 ? (
          <div className={ops.filterSlot}>
            <AdminSelect value={repFilter} onChange={setRepFilter} label="Filter by rep">
              <option value="all">All reps</option>
              {reps.map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
            </AdminSelect>
          </div>
        ) : null}
        <div className={ops.toolbarRow}>
          <Seg<View>
            label="Status"
            value={view}
            onChange={setView}
            options={[
              { value: 'open', label: 'Open', count: openCount },
              { value: 'sold', label: 'Sold' },
              { value: 'lost', label: 'Lost' },
              { value: 'all', label: 'All' },
            ]}
          />
          <button
            type="button"
            className={cx(ops.btn, ops.iconOnlyPhone)}
            disabled={shown.length === 0}
            onClick={() => void exportCsv()}
            aria-label="Export CSV"
          >
            <Download size={18} aria-hidden="true" />
            <span className={ops.btnText}>Export CSV</span>
          </button>
        </div>
      </div>

      <section className={cx(rep.panel, ops.listPanel)} aria-label="Solar leads">
        {body}
      </section>

      {openLead ? <LeadSheet key={openLead.id} lead={openLead} onClose={closeSheet} onChanged={patchLead} /> : null}
    </div>
  );
}

function LeadRow({ lead, onOpen }: { lead: SolarLeadView; onOpen: () => void }) {
  const place = leadPlace(lead);
  const bill = billLine(lead.monthlyBill);
  const closed = lead.status === 'sold' || lead.status === 'lost';
  return (
    <button type="button" className={cx(css.row, closed && css.closed)} onClick={onOpen}>
      <span className={cx(css.cell, css.who)}>
        <span className={css.main}>{leadName(lead)}</span>
        {place ? <span className={css.sub}>{place}</span> : null}
      </span>
      <span className={cx(css.cell, css.rep)}>
        <span className={css.main}>{lead.repName || 'Unknown rep'}</span>
        <span className={css.sub}>{lead.source === 'knock' ? '3C Doors' : 'Solar deck'}</span>
      </span>
      <span className={cx(css.cell, css.bill)}>
        <span className={css.main}>{bill || 'No bill'}</span>
        <span className={css.sub}>{lead.creditTier ? CREDIT_LABEL[lead.creditTier] : 'Credit not picked'}</span>
      </span>
      <span className={cx(css.cell, css.when)}>
        {lead.booking ? (
          <>
            <span className={css.main}>{consultTime(lead.booking)}</span>
            <span className={css.sub}>
              {modeLabel(lead.booking.mode)} with {lead.booking.consultantName}
            </span>
          </>
        ) : (
          <span className={cx(css.main, css.unbooked)}>Not booked</span>
        )}
      </span>
      <span className={css.status}>
        <StatusDot tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusDot>
      </span>
      <ChevronRight size={18} className={css.chev} aria-hidden="true" />
    </button>
  );
}

type Busy = null | 'sold' | 'lost' | 'reopen' | 'cancel';

function LeadSheet({
  lead,
  onClose,
  onChanged,
}: {
  lead: SolarLeadView;
  onClose: () => void;
  onChanged: (id: string, patch: Partial<SolarLeadView>) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const closed = lead.status === 'sold' || lead.status === 'lost';

  const setStatus = async (status: SolarLeadStatus, which: Exclude<Busy, null | 'cancel'>) => {
    setBusy(which);
    setError('');
    const res = await setLeadStatus(lead.id, status);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || "Couldn't save. Try again.");
      return;
    }
    onChanged(lead.id, { status: res.data.status });
  };

  const cancel = async () => {
    if (!lead.booking) return;
    setBusy('cancel');
    setError('');
    const res = await cancelBooking(lead.booking.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || "Couldn't cancel the booking. Try again.");
      return;
    }
    setConfirmCancel(false);
    onChanged(lead.id, { booking: null, status: closed ? lead.status : 'new' });
  };

  let actions: ReactNode;
  if (confirmCancel && lead.booking) {
    actions = (
      <ConfirmStrip
        label="Cancel this consultation?"
        sub={`${consultTime(lead.booking)} with ${lead.booking.consultantName}. The time opens up again; nobody is emailed.`}
        confirming={busy === 'cancel'}
        confirmLabel="Cancel booking"
        busyLabel="Cancelling…"
        cancelLabel="Keep it"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void cancel()}
      />
    );
  } else {
    actions = (
      <>
        {closed ? (
          <button
            type="button"
            className={cx(rep.btnSecondary, u.sm)}
            disabled={busy !== null}
            onClick={() => void setStatus('new', 'reopen')}
          >
            {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
          </button>
        ) : (
          <div className={css.footRow}>
            <button
              type="button"
              className={cx(rep.btnSecondary, u.sm)}
              disabled={busy !== null}
              onClick={() => void setStatus('lost', 'lost')}
            >
              {busy === 'lost' ? 'Saving…' : 'Mark lost'}
            </button>
            <button
              type="button"
              className={cx(rep.btnPrimary, u.primarySm)}
              disabled={busy !== null}
              onClick={() => void setStatus('sold', 'sold')}
            >
              {busy === 'sold' ? 'Saving…' : 'Mark sold'}
            </button>
          </div>
        )}
        {lead.booking ? (
          <button
            type="button"
            className={css.cancelBooking}
            disabled={busy !== null}
            onClick={() => {
              setError('');
              setConfirmCancel(true);
            }}
          >
            Cancel booking
          </button>
        ) : null}
      </>
    );
  }

  return (
    <AdminSheet
      title={leadName(lead)}
      onClose={onClose}
      footer={
        <div className={css.foot}>
          {error ? (
            <p className={css.footErr} role="alert">
              {error}
            </p>
          ) : null}
          {actions}
        </div>
      }
    >
      <LeadDetail lead={lead} />
    </AdminSheet>
  );
}
