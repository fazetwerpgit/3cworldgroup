'use client';

import { Check, ChevronRight, X } from 'lucide-react';
import type { KnockSaleDraft } from '@/lib/sales/knockDrafts';
import s from './rep.module.css';
import l from './rep-logsale.module.css';

/**
 * Log sale's "Finish your sales": the Solds the rep tapped in 3C Doors that are
 * not logged yet. Picking one fills the entry (address, name, plan, sale date);
 * the x dismisses one that was a mistake.
 */
export function FinishSales({
  drafts,
  selectedId,
  onPick,
  onDismiss,
}: {
  drafts: KnockSaleDraft[];
  selectedId: string | null;
  onPick: (draft: KnockSaleDraft) => void;
  onDismiss: (draft: KnockSaleDraft) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <section className={l.finish} aria-labelledby="finish-h">
      <h2 id="finish-h" className={`${s.kicker} ${l.finishHead}`}>
        Finish your sales · {drafts.length}
      </h2>
      <ul className={l.finishList}>
        {drafts.map((draft) => {
          const selected = draft.id === selectedId;
          const sold = new Date(draft.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <li key={draft.id} className={l.finishRow} data-selected={selected || undefined}>
              <button
                type="button"
                className={l.finishPick}
                aria-pressed={selected}
                onClick={() => onPick(draft)}
              >
                <span className={l.finishText}>
                  <span className={l.finishAddress}>{draft.address}</span>
                  <span className={l.finishMeta}>
                    {[draft.customerName, `Sold ${sold}`, 'from 3C Doors'].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {selected ? (
                  <Check size={20} strokeWidth={2.5} aria-hidden="true" className={l.finishCheck} />
                ) : (
                  <ChevronRight size={20} aria-hidden="true" className={l.manualIcon} />
                )}
              </button>
              <button
                type="button"
                className={l.finishDismiss}
                aria-label={`Dismiss ${draft.address}`}
                onClick={() => onDismiss(draft)}
              >
                <X size={18} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {selectedId ? (
        <p className={l.finishHint}>Filled in. Add the screenshot, or enter it manually.</p>
      ) : null}
    </section>
  );
}
