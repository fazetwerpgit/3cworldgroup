'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminFailed, StatusDot } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import rep from '@/components/portal/rep/rep.module.css';
import { LeadDetail } from './LeadDetail';
import { STATUS_LABEL, STATUS_TONE, consultTime, leadName, modeLabel, nextConsult, savedDate } from './leadDisplay';
import { fetchLeads, type SolarLeadView } from './solarClient';
import css from './solar-leads.module.css';

/** Rows shown before "Show all". */
const FIRST_ROWS = 8;

function rowSub(lead: SolarLeadView): string {
  if (lead.booking) return `${consultTime({ start: lead.booking.start, tz: lead.booking.customerTz })}, ${modeLabel(lead.booking.mode).toLowerCase()}`;
  const saved = savedDate(lead.createdAt);
  return saved ? `Saved ${saved}` : 'No consultation';
}

/** The rep's own leads, read once per visit (and on resume). */
export function useMyLeads() {
  const [leads, setLeads] = useState<SolarLeadView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (background = false) => {
    const res = await fetchLeads({ mine: true });
    if (res.ok) {
      setLeads(res.data.leads);
      setFailed(false);
    } else if (!background) {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    // The first read lands asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useRefreshOnResume(() => load(true));
  const retry = () => {
    setFailed(false);
    void load();
  };
  return { leads, failed, retry };
}

/** The next consultation still ahead, as one plain block. Nothing when there is none. */
export function SolarNextConsult({ leads, onOpen }: { leads: SolarLeadView[] | null; onOpen: (id: string) => void }) {
  const next = leads ? nextConsult(leads) : null;
  if (!next?.booking) return null;
  return (
    <button type="button" className={`${css.next} ${css.nextBtn}`} onClick={() => onOpen(next.id)}>
      <span className={css.nextLabel}>Next consultation</span>
      <span className={css.nextWhen}>{consultTime({ start: next.booking.start, tz: next.booking.customerTz })}</span>
      <span className={css.nextWho}>
        {leadName(next)}, {modeLabel(next.booking.mode).toLowerCase()} with {next.booking.consultantName}
      </span>
    </button>
  );
}

/**
 * Home's next consultation for a solar-only rep: the Solar page's own block
 * and data (useMyLeads), its tap opening the same read-only sheet. Nothing
 * while loading, on a failed read, or with no consultation ahead.
 */
export function SolarHomeNextConsult() {
  const { leads } = useMyLeads();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (leads?.find((lead) => lead.id === openId) ?? null) : null;
  return (
    <>
      <SolarNextConsult leads={leads} onOpen={setOpenId} />
      {open ? <SolarLeadSheet lead={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

/** My leads: status and consultation per homeowner; a tap shows the details, read only. */
export function SolarMyLeads({
  leads,
  failed,
  onRetry,
  onOpen,
}: {
  leads: SolarLeadView[] | null;
  failed: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = leads ? (all ? leads : leads.slice(0, FIRST_ROWS)) : [];

  return (
    <section className={css.mine} aria-labelledby="solar-mine-h">
      <div className={css.mineHead}>
        <h2 id="solar-mine-h" className={css.mineTitle}>
          My leads
        </h2>
        {leads && leads.length > 0 ? <span className={css.mineCount}>{leads.length}</span> : null}
      </div>
      {failed && !leads ? (
        <div className={css.minePad}>
          <AdminFailed what="your leads" onRetry={onRetry} />
        </div>
      ) : !leads ? (
        <div role="status" aria-label="Loading your leads" className={css.mineList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={css.mineRow} aria-hidden="true">
              <span className={css.mineText}>
                <span className={rep.skel} style={{ width: `${52 - i * 8}%`, height: 14 }} />
                <span className={rep.skel} style={{ width: `${38 + (i % 2) * 10}%`, height: 12 }} />
              </span>
            </div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <p className={css.mineEmpty}>Homeowners you save from the deck show here, with their consultation.</p>
      ) : (
        <>
          <ul className={css.mineList}>
            {shown.map((lead) => (
              <li key={lead.id}>
                <button type="button" className={css.mineRow} onClick={() => onOpen(lead.id)}>
                  <span className={css.mineText}>
                    <span className={css.mineName}>{leadName(lead)}</span>
                    <span className={css.mineSub}>{rowSub(lead)}</span>
                  </span>
                  <StatusDot tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusDot>
                </button>
              </li>
            ))}
          </ul>
          {!all && leads.length > FIRST_ROWS ? (
            <button type="button" className={css.mineMore} onClick={() => setAll(true)}>
              Show all {leads.length}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** One lead, read only, in the shell's sheet. */
export function SolarLeadSheet({ lead, onClose }: { lead: SolarLeadView; onClose: () => void }) {
  return (
    <AdminSheet title={leadName(lead)} onClose={onClose}>
      <LeadDetail lead={lead} showRep={false} />
    </AdminSheet>
  );
}
