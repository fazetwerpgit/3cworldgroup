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
  STATUS_LABEL,
  STATUS_TONE,
  billLine,
  consultTime,
  creditLine,
  kwhLine,
  leadName,
  leadPlace,
  modeLabel,
  roofLabel,
  savedDate,
  stageLine,
} from '@/components/portal/solar/leadDisplay';
import {
  cancelBooking,
  fetchLeads,
  setLeadStage,
  setLeadStatus,
  updateLeadExtras,
  type SolarLeadStatus,
  type SolarLeadView,
} from '@/components/portal/solar/solarClient';
import { useAuth } from '@/contexts/AuthContext';
import { useFirstReveal } from '@/hooks/useFirstReveal';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import {
  OUTCOME_LABEL,
  SOLAR_DEMO_OUTCOMES,
  SOLAR_LEAD_STAGES,
  STAGE_LABEL,
  isSolarDemoOutcome,
  isSolarLeadStage,
  stageText,
  type SolarDemoOutcome,
  type SolarLeadStage,
} from '@/lib/solar/leadStage';
import { canCloseSolarLead, isSoldLead, isSoldStage } from '@/lib/solar/closePermission';
import { isOwner } from '@/types';
import rep from '@/components/portal/rep/rep.module.css';
import ops from '@/components/portal/admin-ops/admin-ops.module.css';
import css from '@/components/portal/solar/solar-leads.module.css';

type View = 'open' | 'sold' | 'lost' | 'all';

const IN_VIEW: Record<View, (status: SolarLeadStatus) => boolean> = {
  open: (status) => status === 'new' || status === 'booked',
  sold: (status) => status === 'sold',
  lost: (status) => status === 'lost',
  all: () => true,
};

/**
 * One key per stage choice: 'none', 'appointment_demoed:{outcome}', or a later
 * stage. The stage filter and the sheet's stage picker share it.
 */
function stageKey(lead: Pick<SolarLeadView, 'stage' | 'stageOutcome'>): string {
  if (!lead.stage) return 'none';
  return lead.stage === 'appointment_demoed' ? `appointment_demoed:${lead.stageOutcome ?? 'sale'}` : lead.stage;
}

const STAGE_CHOICES: { key: string; label: string; stage: SolarLeadStage; outcome?: SolarDemoOutcome }[] = [
  ...SOLAR_DEMO_OUTCOMES.map((outcome) => ({
    key: `appointment_demoed:${outcome}`,
    label: `${STAGE_LABEL.appointment_demoed}: ${OUTCOME_LABEL[outcome]}`,
    stage: 'appointment_demoed' as const,
    outcome,
  })),
  ...SOLAR_LEAD_STAGES.filter((st) => st !== 'appointment_demoed').map((stage) => ({
    key: stage,
    label: STAGE_LABEL[stage],
    stage,
  })),
];

function parseStageKey(key: string): { stage: SolarLeadStage | null; outcome?: SolarDemoOutcome } | null {
  if (key === 'none') return { stage: null };
  const [stage, outcome] = key.split(':');
  if (!isSolarLeadStage(stage)) return null;
  if (stage === 'appointment_demoed') return isSolarDemoOutcome(outcome) ? { stage, outcome } : null;
  return { stage };
}

/**
 * Whether picking this stage cancels the lead's live consultation on the
 * server (no sale frees the slot, as Mark lost does), so the sheet asks first.
 */
export function stageChangeCancelsBooking(key: string, lead: Pick<SolarLeadView, 'stage' | 'stageOutcome' | 'booking'>): boolean {
  const next = parseStageKey(key);
  return (
    Boolean(lead.booking) &&
    key !== stageKey(lead) &&
    next?.stage === 'appointment_demoed' &&
    next.outcome === 'no_sale'
  );
}

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
  { key: 'monthlyKwh', label: 'Monthly kWh' },
  { key: 'credit', label: 'Credit' },
  { key: 'roof', label: 'Roof' },
  { key: 'heavyShadeText', label: 'Heavy shade' },
  { key: 'needsReviewText', label: 'Needs review' },
  { key: 'status', label: 'Status' },
  { key: 'stageText', label: 'Stage' },
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
    monthlyKwh: lead.monthlyKwh ?? '',
    credit: creditLine(lead, ''),
    roof: roofLabel(lead.roofType),
    heavyShadeText: lead.heavyShade === null ? '' : lead.heavyShade ? 'Yes' : 'No',
    needsReviewText: lead.needsReview ? 'Yes' : '',
    status: STATUS_LABEL[lead.status],
    stageText: stageText(lead.stage, lead.stageOutcome),
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
 * lead's sheet, which marks it sold (owners only) or lost, reopens it, or
 * cancels the booking. ?lead={id} (the lead alert's link) opens that lead's sheet.
 */
export default function SolarLeads() {
  const router = useRouter();
  const linkedLead = useSearchParams().get('lead');
  const { refresh: refreshBadges } = useOpsQueues();
  const { user } = useAuth();
  const ownerViewer = isOwner(user?.role);

  const [leads, setLeads] = useState<SolarLeadView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('open');
  const [repFilter, setRepFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(false);
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
          (stageFilter === 'all' || stageKey(lead) === stageFilter) &&
          (!reviewOnly || lead.needsReview) &&
          (!q || haystack(lead).includes(q))
      ),
    [leads, view, repFilter, stageFilter, reviewOnly, q]
  );
  const reviewCount = leads?.filter((lead) => lead.needsReview).length ?? 0;
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
    setStageFilter('all');
    setReviewOnly(false);
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
    const nothingOpen = view === 'open' && !q && repFilter === 'all' && stageFilter === 'all' && !reviewOnly;
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
          <span>Stage</span>
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
        <div className={ops.filterSlot}>
          <AdminSelect
            value={stageFilter}
            onChange={(value) => {
              setStageFilter(value);
              // Stages cut across Open / Sold / Lost: show every status while one is picked.
              if (value !== 'all') setView('all');
            }}
            label="Filter by stage"
          >
            <option value="all">All stages</option>
            <option value="none">No stage yet</option>
            {STAGE_CHOICES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div className={cx(ops.toolbarRow, css.statusRow)}>
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
            className={cx(ops.btn, css.reviewToggle)}
            aria-pressed={reviewOnly}
            disabled={!reviewOnly && reviewCount === 0}
            onClick={() => setReviewOnly((on) => !on)}
          >
            Needs review{reviewCount ? ` ${reviewCount}` : ''}
          </button>
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

      {openLead ? (
        <LeadSheet
          key={openLead.id}
          lead={openLead}
          ownerViewer={ownerViewer}
          onClose={closeSheet}
          onChanged={patchLead}
          onReload={() => void load(true)}
        />
      ) : null}
    </div>
  );
}

function LeadRow({ lead, onOpen }: { lead: SolarLeadView; onOpen: () => void }) {
  const place = leadPlace(lead);
  const bill = billLine(lead.monthlyBill);
  const closed = lead.status === 'sold' || lead.status === 'lost';
  const stage = stageLine(lead);
  return (
    <button type="button" className={cx(css.row, closed && css.closed)} onClick={onOpen}>
      <span className={cx(css.cell, css.who)}>
        <span className={css.main}>{leadName(lead)}</span>
        {/* The flag rides the second line, so a long name keeps its room. */}
        {lead.needsReview || place ? (
          <span className={css.whoLine}>
            {lead.needsReview ? <span className={css.reviewBadge}>Needs review</span> : null}
            {place ? <span className={css.sub}>{place}</span> : null}
          </span>
        ) : null}
      </span>
      <span className={cx(css.cell, css.rep)}>
        <span className={css.main}>{lead.repName || 'Unknown rep'}</span>
        <span className={css.sub}>{lead.source === 'knock' ? '3C Doors' : 'Solar deck'}</span>
      </span>
      <span className={cx(css.cell, css.bill)}>
        <span className={css.main}>{bill || 'No bill'}</span>
        <span className={css.sub}>
          {[kwhLine(lead.monthlyKwh), creditLine(lead, 'Credit not picked')]
            .filter(Boolean)
            .join(' · ')}
        </span>
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
      <span className={cx(css.cell, css.stage)} data-empty={stage ? undefined : true} title={stage?.text}>
        {/* The outcome leads ("Proposal sent"): the full "Appointment demoed: ..." never fits the column. */}
        <span className={css.main}>{stage ? stage.short : 'No stage'}</span>
        {stage && stage.short !== stage.text ? <span className={css.sub}>{STAGE_LABEL.appointment_demoed}</span> : null}
      </span>
      <span className={css.status}>
        <StatusDot tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusDot>
      </span>
      <ChevronRight size={18} className={css.chev} aria-hidden="true" />
    </button>
  );
}

type Busy = null | 'sold' | 'lost' | 'reopen' | 'cancel' | 'stage' | 'review';

export function LeadSheet({
  lead,
  ownerViewer,
  onClose,
  onChanged,
  onReload,
}: {
  lead: SolarLeadView;
  /** Owners alone mark a lead sold or change a sold one (lib/solar/closePermission). */
  ownerViewer: boolean;
  onClose: () => void;
  onChanged: (id: string, patch: Partial<SolarLeadView>) => void;
  /** Re-reads the list (a status change also moves the stage on the server). */
  onReload: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Mark lost on a booked lead also cancels its consultation, so it asks first.
  const [confirmLost, setConfirmLost] = useState(false);
  // No sale on a booked lead cancels its consultation too: the picked key waits here for a confirm.
  const [confirmStage, setConfirmStage] = useState<string | null>(null);
  const closed = lead.status === 'sold' || lead.status === 'lost';
  // Selling, and changing a sold lead, is owners' only: everyone else gets
  // the stage read-only on a sold lead, and no sale choices otherwise.
  const canClose = canCloseSolarLead({ isOwner: ownerViewer }, lead);
  const soldLocked = !canClose && isSoldLead(lead);
  const stageChoices = canClose ? STAGE_CHOICES : STAGE_CHOICES.filter((c) => !isSoldStage(c.stage, c.outcome));
  const lockedStage = soldLocked ? stageLine(lead) : null;

  const setStage = async (key: string) => {
    const next = parseStageKey(key);
    if (!next || key === stageKey(lead)) return;
    setBusy('stage');
    setError('');
    const res = await setLeadStage(lead.id, next.stage, next.outcome);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || "Couldn't save the stage. Try again.");
      return;
    }
    setConfirmStage(null);
    onChanged(lead.id, {
      stage: res.data.stage,
      stageOutcome: res.data.outcome,
      status: res.data.status,
      stageHistory: [...lead.stageHistory, res.data.entry],
      // No sale freed the consultation, as Mark lost does.
      ...(res.data.cancelledBookingId ? { booking: null } : {}),
    });
  };

  const markReviewed = async () => {
    setBusy('review');
    setError('');
    const res = await updateLeadExtras(lead.id, { needsReview: false });
    setBusy(null);
    if (!res.ok) {
      setError(res.error || "Couldn't save. Try again.");
      return;
    }
    onChanged(lead.id, { needsReview: false });
  };

  const setStatus = async (status: SolarLeadStatus, which: 'sold' | 'lost' | 'reopen') => {
    setBusy(which);
    setError('');
    const res = await setLeadStatus(lead.id, status);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || "Couldn't save. Try again.");
      return;
    }
    setConfirmLost(false);
    // Mark lost cancelled the live booking with it (the slot is open again).
    onChanged(lead.id, { status: res.data.status, ...(res.data.cancelledBookingId ? { booking: null } : {}) });
    onReload();
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

  const pickStage = (key: string) => {
    setError('');
    if (stageChangeCancelsBooking(key, lead)) {
      setConfirmLost(false);
      setConfirmCancel(false);
      setConfirmStage(key);
    } else {
      setConfirmStage(null);
      void setStage(key);
    }
  };

  let actions: ReactNode;
  if (confirmStage && lead.booking) {
    actions = (
      <ConfirmStrip
        label="Set No sale? This also cancels the consultation."
        sub={`${consultTime(lead.booking)} with ${lead.booking.consultantName} opens up again. The rep and consultant get a notice; the homeowner isn't emailed.`}
        confirming={busy === 'stage'}
        confirmLabel="Set No sale"
        busyLabel="Saving…"
        cancelLabel="Back"
        onCancel={() => setConfirmStage(null)}
        onConfirm={() => void setStage(confirmStage)}
      />
    );
  } else if (confirmLost && lead.booking) {
    actions = (
      <ConfirmStrip
        label="Mark lost? This also frees the consultation."
        sub={`${consultTime(lead.booking)} with ${lead.booking.consultantName} opens up again. The rep and consultant get a notice; the homeowner isn't emailed.`}
        confirming={busy === 'lost'}
        confirmLabel="Mark lost"
        busyLabel="Saving…"
        cancelLabel="Back"
        onCancel={() => setConfirmLost(false)}
        onConfirm={() => void setStatus('lost', 'lost')}
      />
    );
  } else if (confirmCancel && lead.booking) {
    actions = (
      <ConfirmStrip
        label="Cancel this consultation?"
        sub={`${consultTime(lead.booking)} with ${lead.booking.consultantName}. The time opens up again. The rep and consultant get a notice; the homeowner isn't emailed.`}
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
        {closed && soldLocked ? null : closed ? (
          <button
            type="button"
            className={ops.btn}
            disabled={busy !== null}
            onClick={() => void setStatus('new', 'reopen')}
          >
            {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
          </button>
        ) : (
          <div className={css.footRow}>
            <button
              type="button"
              className={ops.btn}
              disabled={busy !== null}
              onClick={() => {
                if (lead.booking) {
                  setError('');
                  setConfirmLost(true);
                } else void setStatus('lost', 'lost');
              }}
            >
              {busy === 'lost' ? 'Saving…' : 'Mark lost'}
            </button>
            {canClose ? (
              <button
                type="button"
                className={ops.btnLime}
                disabled={busy !== null}
                onClick={() => void setStatus('sold', 'sold')}
              >
                {busy === 'sold' ? 'Saving…' : 'Mark sold'}
              </button>
            ) : null}
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
      <section className={css.stagePicker} aria-label="Sales stage">
        <span className={css.stagePickerLabel}>Sales stage</span>
        {soldLocked ? (
          <>
            <span>{lockedStage ? <StatusDot tone={lockedStage.tone}>{lockedStage.text}</StatusDot> : STATUS_LABEL.sold}</span>
            <span className={css.stagePickerLabel}>Only an owner can change a sold deal.</span>
          </>
        ) : (
          <AdminSelect value={stageKey(lead)} onChange={pickStage} label="Sales stage">
            <option value="none">Not set</option>
            {stageChoices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </AdminSelect>
        )}
        {busy === 'stage' ? <span className={css.stagePickerLabel}>Saving…</span> : null}
        {lead.stageHistory.length ? (
          <ol className={css.stageHistory} aria-label="Stage history">
            {[...lead.stageHistory].reverse().slice(0, 8).map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                {entry.stage ? stageText(entry.stage, entry.outcome ?? null) : 'Stage cleared'} · {savedDate(entry.at)}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <LeadDetail
        lead={lead}
        showStage={false}
        reviewAction={
          <button
            type="button"
            className={ops.btn}
            disabled={busy !== null}
            onClick={() => void markReviewed()}
          >
            {busy === 'review' ? 'Saving…' : 'Mark reviewed'}
          </button>
        }
      />
    </AdminSheet>
  );
}
