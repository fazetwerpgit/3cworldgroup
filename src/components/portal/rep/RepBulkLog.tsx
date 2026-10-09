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
import { canCombine } from '@/lib/sales/bulk/group';
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
// screenshots; each one is uploaded and read, three at a time, and screenshots
// of the same order are put together into one sale (lib/sales/bulk/group). The
// list shows every sale with its screenshots and what it still needs, and the
// rep can combine a sale with the one above or split a screenshot off. "Log N
// sales" sends the ready ones one at a time. The single Log Sale form stays the
// default way in.

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
          <span>
            {status.busy
              ? 'Too many reads right now. Try again in a few minutes.'
              : status.shots > 1 && status.unread > 0
                ? `${status.unread === 1 ? '1 screenshot' : `${status.unread} screenshots`} couldn't be read.`
                : "Couldn't read it. Tap to fill in."}
          </span>
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
      return status.editLost ? (
        <p className={`${b.status} ${b.statusWarn}`}>
          <Check size={16} strokeWidth={2.75} aria-hidden="true" />
          <span>Logged, but your changes weren&apos;t saved. Edit this sale from Sales.</span>
        </p>
      ) : (
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
  above,
  index,
  repeat,
  bulk,
  onOpen,
}: {
  row: BulkRow;
  /** The sale listed right above, for "Combine with sale above". */
  above: BulkRow | undefined;
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
  const { formData } = row;
  const shotCount = row.shots.length;
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
        <span className={b.thumbs} data-count={shotCount}>
          {row.shots.map((shot) => (
            <span key={shot.id} className={b.thumb}>
              {bulk.previews[shot.id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
                <img src={bulk.previews[shot.id]} alt="" />
              ) : (
                <ImageIcon size={shotCount > 1 ? 14 : 20} aria-hidden="true" />
              )}
            </span>
          ))}
        </span>
        <span className={b.cardText}>
          <span className={b.cardTitle}>
            <span className={b.cardNum}>{index + 1}</span>
            {formData.customerName || (working ? 'Reading screenshot' : 'No name')}
          </span>
          <span className={b.cardLine}>{formData.customerAddress || (working ? ' ' : 'No address')}</span>
          {meta.length > 0 ? <span className={b.cardMeta}>{meta.join(' · ')}</span> : null}
          {shotCount > 1 ? <span className={b.cardShots}>{shotCount} screenshots</span> : null}
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
        {status.kind !== 'repeat' && canCombine(above, row) && !bulk.sending ? (
          <button type="button" className={b.combine} onClick={() => bulk.combine(row.id)}>
            Combine with sale above
          </button>
        ) : null}
        <StatusLine
          status={status}
          uploadError={row.shots.map((shot) => bulk.uploadErrors[shot.id]).find(Boolean)}
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
    if (bulk.sending) return;
    bulk.startOver();
    setConfirmClear(false);
  };

  const buttonLabel = bulk.sending
    ? 'Logging…'
    : bulk.busy
      ? `Reading ${bulk.working} of ${bulk.shots}…`
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
          Pick the order screenshots. We&apos;ll put each sale&apos;s screenshots together and fill it in. You check
          them, then log them all.
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
                <button type="button" className={s.btnSecondary} onClick={startOver} disabled={bulk.sending}>
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
            <button
              type="button"
              className={l.draftStartOver}
              onClick={() => setConfirmClear(true)}
              disabled={bulk.sending}
            >
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
                above={bulk.rows[index - 1]}
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
                {bulk.shots} of {BULK_MAX_FILES} screenshots
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
          <p className={l.entryWorks}>
            Up to {BULK_MAX_FILES} at a time. Screenshots of the same order go together as one sale.
          </p>
        </section>
      )}

      {editingRow ? (
        <BulkSaleSheet
          key={editingRow.id}
          row={editingRow}
          label={`Sale ${editingIndex + 1}`}
          previews={bulk.previews}
          onSplit={bulk.splitShot}
          onRemoveShot={bulk.removeShot}
          onReadShot={bulk.readShotAgain}
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
