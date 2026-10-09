'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImageIcon, X } from 'lucide-react';
import { useSaleFormState } from '@/hooks/useSaleFormState';
import {
  isUnread,
  orderConflict,
  rowProblems,
  rowProofPaths,
  type BulkRow,
  type BulkSaleFields,
} from '@/lib/sales/bulk/batch';
import type { ScanTarget } from '@/lib/sales/scan/fills';
import { BodyLayer } from './BodyLayer';
import { useAttachmentViewer } from './ImageViewer';
import { signedProofUrl } from './ProofCapture';
import { DEFAULT_PROVIDER, SaleFields } from './SaleFields';
import s from './rep.module.css';
import b from './rep-bulklog.module.css';

// One sale of the bulk batch, opened for checking. The same fields and rules as
// the single Log Sale form (SaleFields + useSaleFormState, without the saved
// single-sale draft); Save puts the values back on the sale. Its screenshots
// are listed on top: each can be viewed, made its own sale, removed, or read
// again when its read failed (those act right away, not on Save).

export type BulkSaleChange = BulkSaleFields;

export function BulkSaleSheet({
  row,
  label,
  previews,
  onSplit,
  onRemoveShot,
  onReadShot,
  onSave,
  onClose,
}: {
  row: BulkRow;
  /** "Sale 3". */
  label: string;
  /** Card thumbnails by screenshot. */
  previews: Record<string, string>;
  /** "Make its own sale". */
  onSplit: (shotId: string) => void;
  onRemoveShot: (shotId: string) => void;
  /** "Read again" for a screenshot whose read failed. */
  onReadShot: (shotId: string) => void;
  onSave: (change: BulkSaleChange) => void;
  onClose: () => void;
}) {
  // The refs stay out of `form`, which is read during render.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- errorRef: the sheet has no server error box
  const { formRef, errorRef, ...form } = useSaleFormState({
    persist: false,
    initial: {
      formData: row.formData,
      products: row.products,
      proofPaths: rowProofPaths(row),
      saleDateTouched: row.saleDateTouched,
    },
  });
  const [providerChoice, setProviderChoice] = useState<string | null>(row.provider);
  const [flags, setFlags] = useState(row.flags);
  const [moreOpen, setMoreOpen] = useState(false);
  const provider = form.provider ?? providerChoice ?? DEFAULT_PROVIDER;
  const viewer = useAttachmentViewer();
  const problems = rowProblems({ formData: form.formData, products: form.products, shots: row.shots });
  // Saving is the rep's answer to "which order number": the note goes then.
  const conflict = orderConflict(row);
  const many = row.shots.length > 1;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // The list behind keeps re-rendering while other screenshots are read: the
  // focus and the Escape handler are set up once, not on every new onClose.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A field the rep looked at or changed no longer needs "Check this".
  const clearFlag = (target: ScanTarget) =>
    setFlags((prev) => {
      if (!prev[target]) return prev;
      const next = { ...prev };
      delete next[target];
      return next;
    });

  const chooseProvider = (company: string) => {
    clearFlag('plan');
    setProviderChoice(company);
    form.keepProvider(company);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      formData: form.formData,
      products: form.products,
      provider: form.provider ?? providerChoice,
      saleDateTouched: form.saleDateTouched,
      flags,
    });
  };

  // The full screenshot once uploaded; the card thumbnail only until then.
  const viewScreenshot = (shot: BulkRow['shots'][number], name: string, button: HTMLElement) => {
    const path = shot.proofPath;
    if (path) viewer.open(() => signedProofUrl(path), name, button);
    else if (previews[shot.id]) viewer.show(previews[shot.id], name, button);
  };

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={`${s.sheet} ${b.editSheet}`} role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="bulk-edit-title" className={s.sheetTitle}>
              {label}
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <form ref={formRef} className={b.editForm} onSubmit={save} noValidate>
            <div className={`${s.sheetBody} ${b.editBody}`}>
              <ul className={b.shots} aria-label="Screenshots">
                {row.shots.map((shot, i) => {
                  const name = many ? `Screenshot ${i + 1}` : 'Screenshot';
                  return (
                    <li key={shot.id} className={b.shot}>
                      <button
                        type="button"
                        className={b.viewShot}
                        onClick={(event) => viewScreenshot(shot, `${label} ${name.toLowerCase()}`, event.currentTarget)}
                        disabled={!shot.proofPath && !previews[shot.id]}
                      >
                        <span className={b.shotThumb}>
                          {previews[shot.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
                            <img src={previews[shot.id]} alt="" />
                          ) : (
                            <ImageIcon size={16} aria-hidden="true" />
                          )}
                        </span>
                        View {name.toLowerCase()}
                      </button>
                      {isUnread(shot) ? (
                        <span className={b.shotActions}>
                          <span className={b.shotNote}>
                            {shot.readBusy ? 'Too many reads right now' : "Couldn't be read"}
                          </span>
                          <button
                            type="button"
                            className={b.shotAction}
                            onClick={() => onReadShot(shot.id)}
                            aria-label={`Read ${name.toLowerCase()} again`}
                          >
                            Read again
                          </button>
                        </span>
                      ) : shot.phase === 'reading' ? (
                        <span className={b.shotNote}>Reading</span>
                      ) : null}
                      {many ? (
                        <span className={b.shotActions}>
                          <button type="button" className={b.shotAction} onClick={() => onSplit(shot.id)}>
                            Make its own sale
                          </button>
                          <button
                            type="button"
                            className={b.shotAction}
                            onClick={() => onRemoveShot(shot.id)}
                            aria-label={`Remove ${name.toLowerCase()}`}
                          >
                            Remove
                          </button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {conflict.length > 0 ? (
                <p className={b.editNeeds} role="note">
                  <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
                  These screenshots show different order numbers ({conflict.map((n) => `#${n}`).join(', ')}). Keep the
                  right one below and save, or make a screenshot its own sale.
                </p>
              ) : null}
              <p className={problems.length > 0 ? b.editNeeds : b.editReady} role="status">
                {problems.length > 0 ? (
                  <>
                    <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
                    {problems.join(' · ')}
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                    Ready to log
                  </>
                )}
              </p>
              <SaleFields
                form={form}
                provider={provider}
                onProvider={chooseProvider}
                orderRequired={rowProofPaths(row).length === 0}
                scan={{ pending: () => false, edited: clearFlag, seen: clearFlag, flags }}
                moreOpen={moreOpen}
                onMoreOpen={setMoreOpen}
              />
            </div>
            <div className={b.editActions}>
              <button type="button" className={s.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={s.btnPrimary}>
                Save
              </button>
            </div>
          </form>
          {viewer.viewer}
        </section>
      </div>
    </BodyLayer>
  );
}
