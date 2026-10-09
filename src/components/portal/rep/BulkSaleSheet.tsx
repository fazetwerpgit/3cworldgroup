'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImageIcon, X } from 'lucide-react';
import { useSaleFormState } from '@/hooks/useSaleFormState';
import { rowProblems, type BulkRow } from '@/lib/sales/bulk/batch';
import type { ScanTarget } from '@/lib/sales/scan/fills';
import { BodyLayer } from './BodyLayer';
import { useAttachmentViewer } from './ImageViewer';
import { signedProofUrl } from './ProofCapture';
import { DEFAULT_PROVIDER, SaleFields } from './SaleFields';
import s from './rep.module.css';
import b from './rep-bulklog.module.css';

// One row of the bulk batch, opened for checking. The same fields and rules as
// the single Log Sale form (SaleFields + useSaleFormState, without the saved
// single-sale draft); Save puts the values back on the row.

export type BulkSaleChange = Pick<BulkRow, 'formData' | 'products' | 'provider' | 'saleDateTouched' | 'flags'>;

export function BulkSaleSheet({
  row,
  label,
  preview,
  onSave,
  onClose,
}: {
  row: BulkRow;
  /** "Sale 3". */
  label: string;
  /** The picked file's local URL, while it is still in memory. */
  preview: string | null;
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
      proofPaths: row.proofPath ? [row.proofPath] : [],
      saleDateTouched: row.saleDateTouched,
    },
  });
  const [providerChoice, setProviderChoice] = useState<string | null>(row.provider);
  const [flags, setFlags] = useState(row.flags);
  const [moreOpen, setMoreOpen] = useState(false);
  const provider = form.provider ?? providerChoice ?? DEFAULT_PROVIDER;
  const viewer = useAttachmentViewer();
  const problems = rowProblems({ formData: form.formData, products: form.products, proofPath: row.proofPath });
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

  const viewScreenshot = (button: HTMLElement) => {
    if (preview) viewer.show(preview, `${label} screenshot`, button);
    else if (row.proofPath) {
      const path = row.proofPath;
      viewer.open(() => signedProofUrl(path), `${label} screenshot`, button);
    }
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
              {row.proofPath || preview ? (
                <button
                  type="button"
                  className={b.viewShot}
                  onClick={(event) => viewScreenshot(event.currentTarget)}
                >
                  <ImageIcon size={18} aria-hidden="true" />
                  View screenshot
                </button>
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
                orderRequired={!row.proofPath}
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
