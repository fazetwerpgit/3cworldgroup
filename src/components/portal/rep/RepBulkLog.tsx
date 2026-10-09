'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  CopyCheck,
  Eraser,
  History,
  ImageIcon,
  ImagePlus,
  ImageUp,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { getPlanById } from '@/types';
import {
  BULK_MAX_FILES,
  isIncluded,
  rowStatus,
  summaryText,
  type BulkRepeat,
  type BulkRow,
  type BulkStatus,
} from '@/lib/sales/bulk/batch';
import { isExtraPlanId } from '@/lib/sales/planSelection';
import { BodyLayer } from './BodyLayer';
import { BulkSaleSheet } from './BulkSaleSheet';
import { orderDuplicateHeadline } from './RepLogSale';
import { useHideRepTabBar } from './RepShell';
import { useBulkLog, type BulkLog } from './useBulkLog';
import s from './rep.module.css';
import l from './rep-logsale.module.css';
import b from './rep-bulklog.module.css';

// Log several sales from screenshots. The rep picks up to BULK_MAX_FILES order
// screenshots; each one is uploaded as its sale's proof and read, three at a
// time. The list shows every sale with what it still needs, flags repeats in
// the batch, and "Log N sales" sends the ready ones one at a time. The single
// Log Sale form stays the default way in.

const IMAGE_ACCEPT = 'image/*';

const shortDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function planName(row: BulkRow): string {
  const plan = row.products.find((p) => !isExtraPlanId(p.productId));
  return plan ? (getPlanById(plan.productId)?.name ?? plan.productName) : '';
}

function StatusLine({
  status,
  uploadError,
  onRetryUpload,
  onReadAgain,
  onLogAnyway,
  sending,
}: {
  status: BulkStatus;
  uploadError?: string;
  onRetryUpload: () => void;
  onReadAgain: () => void;
  onLogAnyway: () => void;
  sending: boolean;
}) {
  switch (status.kind) {
    case 'uploading':
    case 'reading':
    case 'sending':
      return (
        <p className={`${b.status} ${b.statusBusy}`}>
          <Loader2 size={16} className={l.spin} aria-hidden="true" />
          {status.kind === 'uploading' ? 'Uploading' : status.kind === 'reading' ? 'Reading' : 'Logging'}
        </p>
      );
    case 'upload_failed':
      return (
        <div className={`${b.status} ${b.statusBad}`}>
          <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>Couldn&apos;t upload{uploadError ? `: ${uploadError}` : ''}</span>
          <button type="button" className={b.statusAction} onClick={onRetryUpload}>
            <RotateCcw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      );
    case 'read_failed':
      return (
        <div className={`${b.status} ${b.statusWarn}`}>
          <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>Couldn&apos;t read it. Tap to fill in.</span>
          <button type="button" className={b.statusAction} onClick={onReadAgain}>
            Read again
          </button>
        </div>
      );
    case 'needs_info':
      return (
        <p className={`${b.status} ${b.statusWarn}`}>
          <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>Needs info: {status.problems.join(' · ')}</span>
        </p>
      );
    case 'repeat':
      return (
        <p className={`${b.status} ${b.statusWarn}`}>
          <CopyCheck size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>
            Repeated: {status.repeat.by === 'image' ? 'same screenshot' : 'same order number'} as sale{' '}
            {status.repeat.of}
          </span>
        </p>
      );
    case 'already':
      return (
        <div className={`${b.status} ${b.statusWarn}`}>
          <CopyCheck size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>{orderDuplicateHeadline(status.duplicate)}</span>
          <button type="button" className={b.statusAction} onClick={onLogAnyway} disabled={sending}>
            Log anyway
          </button>
        </div>
      );
    case 'failed':
      return (
        <p className={`${b.status} ${b.statusBad}`}>
          <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>Not logged. {status.reason}</span>
        </p>
      );
    case 'logged':
      return (
        <p className={`${b.status} ${b.statusGood}`}>
          <Check size={16} strokeWidth={2.75} aria-hidden="true" />
          Logged
        </p>
      );
    case 'ready':
      return (
        <p className={`${b.status} ${b.statusGood}`}>
          <Check size={16} strokeWidth={2.75} aria-hidden="true" />
          Ready
        </p>
      );
  }
}

function BulkCard({
  row,
  index,
  repeat,
  bulk,
  onOpen,
}: {
  row: BulkRow;
  index: number;
  repeat: BulkRepeat | undefined;
  bulk: BulkLog;
  onOpen: () => void;
}) {
  const status = rowStatus(row, repeat);
  const label = `Sale ${index + 1}`;
  const locked = status.kind === 'logged' || status.kind === 'sending';
  const working = status.kind === 'uploading' || status.kind === 'reading';
  const included = isIncluded(row, repeat);
  // Logged rows stay ticked and an "already logged" one unticked: neither is
  // the rep's to change here ("Log anyway" sends that one on its own).
  const fixedPick = locked || status.kind === 'already';
  const checked = status.kind === 'logged' || (status.kind !== 'already' && included);
  const preview = bulk.previews[row.id];
  const { formData } = row;
  const plan = planName(row);
  const meta = [
    plan,
    formData.orderNumberOrBtn ? `#${formData.orderNumberOrBtn}` : null,
    formData.saleDate ? `Sold ${shortDate(formData.saleDate)}` : null,
    formData.installDate ? `Installs ${shortDate(formData.installDate)}` : null,
  ].filter(Boolean);

  return (
    <li className={b.card} data-status={status.kind} data-skipped={!checked && !fixedPick ? '' : undefined}>
      <label className={b.check}>
        <input
          type="checkbox"
          checked={checked}
          disabled={fixedPick || bulk.sending}
          onChange={(e) => bulk.setInclude(row.id, e.target.checked)}
          aria-label={`Include ${label.toLowerCase()}`}
        />
        <span className={b.box} aria-hidden="true">
          {checked ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      </label>
      <button
        type="button"
        className={b.cardOpen}
        onClick={onOpen}
        disabled={locked || working || status.kind === 'upload_failed' || bulk.sending}
        aria-label={`Check ${label.toLowerCase()}`}
      >
        <span className={b.thumb}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
            <img src={preview} alt="" />
          ) : (
            <ImageIcon size={20} aria-hidden="true" />
          )}
        </span>
        <span className={b.cardText}>
          <span className={b.cardTitle}>
            <span className={b.cardNum}>{index + 1}</span>
            {formData.customerName || (working ? 'Reading screenshot' : 'No name')}
          </span>
          <span className={b.cardLine}>{formData.customerAddress || (working ? ' ' : 'No address')}</span>
          {meta.length > 0 ? <span className={b.cardMeta}>{meta.join(' · ')}</span> : null}
        </span>
      </button>
      {locked ? null : (
        <button
          type="button"
          className={b.remove}
          onClick={() => bulk.remove(row.id)}
          aria-label={`Remove ${label.toLowerCase()}`}
          disabled={bulk.sending}
        >
          <X size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      <div className={b.cardStatus} role="status">
        <StatusLine
          status={status}
          uploadError={bulk.uploadErrors[row.id]}
          onRetryUpload={() => bulk.retryUpload(row.id)}
          onReadAgain={() => bulk.readAgain(row.id)}
          onLogAnyway={() => bulk.logAnyway(row.id)}
          sending={bulk.sending}
        />
      </div>
    </li>
  );
}

function Picker({ label, onPick, primary }: { label: string; onPick: (files: File[]) => void; primary?: boolean }) {
  const id = useId();
  return (
    <label className={primary ? `${s.btnPrimary} ${s.btnBlock}` : `${s.btnSecondary} ${b.addMore}`} htmlFor={id}>
      <input
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className={s.srOnly}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Clear so picking the same files again still fires.
          e.target.value = '';
          onPick(files);
        }}
      />
      {primary ? <ImageUp size={20} strokeWidth={2.25} aria-hidden="true" /> : <ImagePlus size={18} aria-hidden="true" />}
      {label}
    </label>
  );
}

export function RepBulkLog() {
  const bulk = useBulkLog();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasRows = bulk.rows.length > 0;
  useHideRepTabBar(hasRows);

  const editingIndex = editing ? bulk.rows.findIndex((row) => row.id === editing) : -1;
  const editingRow = editingIndex >= 0 ? bulk.rows[editingIndex] : null;

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bulk.finished) summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [bulk.finished]);

  const startOver = () => {
    bulk.startOver();
    setConfirmClear(false);
  };

  const working = bulk.rows.filter((row) => row.phase === 'uploading' || row.phase === 'reading').length;
  const buttonLabel = bulk.sending
    ? 'Logging…'
    : bulk.busy
      ? `Reading ${working} of ${bulk.rows.length}…`
      : bulk.toSend === 0
        ? 'Nothing ready to log'
        : `Log ${bulk.toSend} ${bulk.toSend === 1 ? 'sale' : 'sales'}`;

  const bar = (fixed: boolean) => (
    <div className={fixed ? l.submitBar : `${l.submitInline} ${b.barInline}`}>
      <p className={b.barCount}>
        <span className={s.kicker}>Ready</span>
        <span className={b.barNum}>
          {bulk.toSend} of {bulk.rows.length}
        </span>
      </p>
      <button
        type="button"
        className={`${s.btnPrimary} ${l.submit}`}
        onClick={() => void bulk.logAll()}
        disabled={bulk.sending || bulk.busy || bulk.toSend === 0}
      >
        {buttonLabel}
      </button>
    </div>
  );

  return (
    <div className={`${l.main} ${hasRows ? l.mainDetails : ''} ${b.page}`}>
      <header className={b.head}>
        <h1 className={l.title}>Log several sales</h1>
        <p className={l.lede}>
          Pick the order screenshots, one per sale. We&apos;ll fill in each one. You check them, then log them all.
        </p>
      </header>

      {bulk.fromSaved && hasRows && !bulk.finished ? (
        confirmClear ? (
          <div className={`${l.dupe} ${b.notice}`} role="group" aria-labelledby="bulk-clear-h">
            <Eraser size={20} strokeWidth={2} aria-hidden="true" />
            <div className={l.dupeBody}>
              <p id="bulk-clear-h">
                <strong>Clear this batch?</strong>
              </p>
              <p className={l.dupeMeta}>Sales already logged stay logged. Everything else here goes.</p>
              <div className={l.dupeActions}>
                <button type="button" className={s.btnSecondary} onClick={startOver}>
                  Clear
                </button>
                <button type="button" className={l.dupeNew} onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`${l.draftBar} ${b.notice}`}>
            <History size={18} strokeWidth={2} aria-hidden="true" />
            <p>Picking up where you left off</p>
            <button type="button" className={l.draftStartOver} onClick={() => setConfirmClear(true)}>
              Start over
            </button>
          </div>
        )
      ) : null}

      {bulk.lost > 0 ? (
        <p className={`${b.note} ${b.notice}`} role="status">
          {bulk.lost === 1
            ? "1 screenshot didn't finish uploading. Pick it again."
            : `${bulk.lost} screenshots didn't finish uploading. Pick them again.`}
        </p>
      ) : null}

      {bulk.overCap ? (
        <p className={`${b.note} ${b.notice}`} role="status">
          Only {BULK_MAX_FILES} at a time. The extra ones were left off.
        </p>
      ) : null}

      {bulk.finished ? (
        <div ref={summaryRef} className={`${l.group} ${b.summary} ${b.notice}`} role="status">
          <p className={b.summaryText}>
            <Check size={20} strokeWidth={2.75} aria-hidden="true" />
            <strong>{summaryText(bulk.summary)}</strong>
          </p>
          <Link href="/portal/sales" className={s.btnSecondary}>
            Go to Sales
          </Link>
        </div>
      ) : null}

      {hasRows ? (
        <>
          <ol className={b.list}>
            {bulk.rows.map((row, index) => (
              <BulkCard
                key={row.id}
                row={row}
                index={index}
                repeat={bulk.repeats.get(row.id)}
                bulk={bulk}
                onOpen={() => setEditing(row.id)}
              />
            ))}
          </ol>
          {bulk.room > 0 && !bulk.sending ? (
            <div className={b.more}>
              <Picker label="Add more screenshots" onPick={bulk.addFiles} />
              <p className={b.moreNote}>
                {bulk.rows.length} of {BULK_MAX_FILES}
              </p>
            </div>
          ) : null}
          {bar(false)}
          <BodyLayer>{bar(true)}</BodyLayer>
        </>
      ) : (
        <section className={`${l.entry} ${b.empty}`} aria-label="Pick screenshots">
          <div className={l.entryBody}>
            <Picker label="Choose screenshots" onPick={bulk.addFiles} primary />
          </div>
          <p className={l.entryWorks}>Up to {BULK_MAX_FILES} at a time. Each screenshot is one sale.</p>
        </section>
      )}

      {editingRow ? (
        <BulkSaleSheet
          key={editingRow.id}
          row={editingRow}
          label={`Sale ${editingIndex + 1}`}
          preview={bulk.previews[editingRow.id] ?? null}
          onSave={(change) => {
            bulk.save(editingRow.id, change);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
