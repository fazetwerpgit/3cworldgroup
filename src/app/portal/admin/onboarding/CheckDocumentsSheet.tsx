'use client';

import { useEffect, useId, useState } from 'react';
import { FileText, Lock } from 'lucide-react';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { useAttachmentViewer } from '@/components/portal/rep/ImageViewer';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import o from './admin-onboarding.module.css';
import t from './todo.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { isEsignItem } from '@/lib/onboarding/esign';
import { isOwner } from '@/types';
import {
  isWaitingOnYou,
  itemLine,
  needsCheck,
  needsSending,
  personName,
  type ChecklistItem,
  type ChecklistPerson,
} from './checklist';
import { MarkCompleteForm } from './MarkCompleteForm';

// The review route verifies the reviewer from the ID token and stamps their uid
// and name onto the submission — the rep sees that name, so it must not be
// client-supplied. userId in the body is the TARGET rep being reviewed.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

type Files = ChecklistItem['files'];

/**
 * One person's documents: what is waiting on you first (Approve / Ask to fix,
 * or Send for signature), the rest of their checklist folded away below.
 * `onChanged` reloads the checklist after each action; `onFinished` runs once
 * the last waiting item is handled.
 */
export function CheckDocumentsSheet({
  person,
  onClose,
  onChanged,
  onFinished,
}: {
  person: ChecklistPerson;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onFinished: () => void;
}) {
  const { user } = useAuth();
  const canMarkComplete = isOwner(user?.role);
  const name = personName(person);
  const reasonId = useId();
  // In-app viewer, not a new tab: a tab opened after an await is blocked or
  // opens blank in Safari and strands an iPhone home-screen app.
  const viewer = useAttachmentViewer();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<{ itemId: string; text: string } | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  // Files of an item already reviewed, fetched on demand (each sensitive opening is audited).
  const [openedFiles, setOpenedFiles] = useState<Record<string, Files>>({});
  const [handled, setHandled] = useState(false);

  const waiting = person.items.filter(isWaitingOnYou);
  const rest = person.items.filter((item) => !isWaitingOnYou(item));
  // Opened with something waiting: handling the last of it closes the sheet.
  const [hadWaiting] = useState(waiting.length > 0);

  useEffect(() => {
    if (hadWaiting && handled && waiting.length === 0) onFinished();
  }, [hadWaiting, handled, waiting.length, onFinished]);

  /** Runs one item action; a failure shows under that item. */
  const act = async (item: ChecklistItem, run: () => Promise<string | void>) => {
    setProcessingId(item.id);
    setFailure(null);
    setNotice('');
    try {
      const message = await run();
      if (message) setNotice(message);
    } catch (err) {
      setFailure({ itemId: item.id, text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setProcessingId(null);
    }
  };

  const post = async (url: string, body: Record<string, unknown>, fallback: string) => {
    const response = await fetch(url, { method: 'POST', headers: await authHeaders(true), body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : fallback);
    return json as Record<string, unknown>;
  };

  const afterChange = async () => {
    setHandled(true);
    await onChanged();
  };

  const review = (item: ChecklistItem, status: 'approved' | 'rejected') =>
    act(item, async () => {
      await post(
        '/api/portal/onboarding/review',
        {
          userId: item.userId,
          itemId: item.itemId,
          status,
          rejectionReason: status === 'rejected' ? reason.trim() : undefined,
        },
        'Failed to review submission'
      );
      setFixingId(null);
      setReason('');
      await afterChange();
      return status === 'approved' ? `${item.itemLabel} approved.` : `${item.itemLabel} sent back to ${name} to fix.`;
    });

  const sendForSignature = (item: ChecklistItem) =>
    act(item, async () => {
      const json = await post(
        '/api/portal/onboarding/esign-send',
        { userId: item.userId, itemId: item.itemId },
        'Failed to send for signature'
      );
      await afterChange();
      return json.reason === 'envelope_exists'
        ? `${item.itemLabel} was already sent to ${name}.`
        : `Sent ${item.itemLabel} to ${name}. They can sign it in their portal.`;
    });

  const openFiles = (item: ChecklistItem) =>
    act(item, async () => {
      const params = new URLSearchParams({ userId: item.userId, itemId: item.itemId });
      const response = await fetch(`/api/portal/onboarding/files?${params}`, { headers: await authHeaders() });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : "Couldn't open the files");
      setOpenedFiles((prev) => ({ ...prev, [item.id]: Array.isArray(json.files) ? json.files : [] }));
    });

  const renderFiles = (item: ChecklistItem, files: Files) => {
    if (item.referenceKind === 'storage' && item.adminOnly) {
      return (
        <p className={o.locked}>
          <Lock size={16} aria-hidden="true" />
          Admin only. Sensitive files are visible to admins.
        </p>
      );
    }
    if (item.referenceKind !== 'storage') {
      return <p className={o.quote}>{item.reference ?? 'No reference on file.'}</p>;
    }
    if (files.length === 0) {
      return <p className={o.quote}>No files found at {item.reference ?? 'this reference'}.</p>;
    }
    return (
      <>
        <div className={o.files}>
          {files.map((file) =>
            // Photos open in the page. A PDF (or a HEIC, which only Apple's
            // browsers draw) stays a link: a real tap opens it.
            /^image\/(jpeg|png|webp)$/.test(file.contentType) ? (
              <button
                key={file.name}
                type="button"
                className={`${o.file} ${o.fileBtn}`}
                onClick={(event) => viewer.show(file.url, `${item.itemLabel}: ${file.name}`, event.currentTarget)}
              >
                <FileText size={16} aria-hidden="true" />
                <span>{file.name}</span>
              </button>
            ) : (
              <a key={file.name} href={file.url} target="_blank" rel="noopener noreferrer" className={o.file}>
                <FileText size={16} aria-hidden="true" />
                <span>{file.name}</span>
              </a>
            )
          )}
        </div>
        <p className={u.hint}>Links expire in 15 minutes.</p>
      </>
    );
  };

  const renderItem = (item: ChecklistItem) => {
    const working = processingId === item.id;
    const esign = isEsignItem(item.itemId);
    const check = needsCheck(item);
    const send = needsSending(item);
    // Anything submitted can be sent back, including a document out for signature.
    const fixable = item.status === 'submitted' && !item.onHold;
    const showPdf = esign && item.status === 'approved' && item.hasSignedPdf;
    // Files of an upload under review come with the list; older ones on request.
    const files = check ? item.files : openedFiles[item.id];
    const canOpenFiles =
      !check && !files && !esign && item.referenceKind === 'storage' && Boolean(item.reference) && !item.adminOnly;
    const markable = canMarkComplete && item.status !== 'approved';
    const fixing = fixingId === item.id;
    const marking = markingId === item.id;
    const formOpen = fixing || marking;

    return (
      <li key={item.id} className={o.item}>
        <span className={o.itemText}>
          <strong className={o.itemName}>{item.itemLabel}</strong>
          <span className={o.itemDetail}>{itemLine(item)}</span>
        </span>

        {files ? <div className={o.reference}>{renderFiles(item, files)}</div> : null}

        {failure?.itemId === item.id ? (
          <AdminNotice tone="error" onDismiss={() => setFailure(null)}>
            {failure.text}
          </AdminNotice>
        ) : null}

        {fixing ? (
          <div className={u.field}>
            <label className={u.label} htmlFor={reasonId}>
              What needs fixing? {name} sees this.
            </label>
            <textarea
              id={reasonId}
              className={`${u.input} ${u.textarea}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The photo is blurry. Please upload a clearer one."
              rows={2}
            />
            <div className={u.btnRow}>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                disabled={working}
                onClick={() => setFixingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                disabled={working || !reason.trim()}
                onClick={() => void review(item, 'rejected')}
              >
                {working ? 'Sending…' : 'Ask to fix'}
              </button>
            </div>
          </div>
        ) : null}

        {marking ? (
          <MarkCompleteForm
            target={item}
            onCancel={() => setMarkingId(null)}
            onDone={() => {
              setMarkingId(null);
              setNotice(`${item.itemLabel} marked complete.`);
              void afterChange();
            }}
          />
        ) : null}

        {!formOpen && (check || send || fixable || showPdf || canOpenFiles || markable) ? (
          <div className={u.btnRow}>
            {check ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                disabled={working}
                onClick={() => void review(item, 'approved')}
              >
                {working ? 'Working…' : 'Approve'}
              </button>
            ) : null}
            {send ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                disabled={working}
                onClick={() => void sendForSignature(item)}
              >
                {working ? 'Sending…' : 'Send for signature'}
              </button>
            ) : null}
            {fixable ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                disabled={working}
                onClick={() => {
                  setFailure(null);
                  setReason('');
                  setMarkingId(null);
                  setFixingId(item.id);
                }}
              >
                Ask to fix
              </button>
            ) : null}
            {canOpenFiles ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                disabled={working}
                onClick={() => void openFiles(item)}
              >
                <FileText size={16} aria-hidden="true" />
                {working ? 'Opening…' : 'View files'}
              </button>
            ) : null}
            {showPdf && item.adminOnly ? (
              <span className={`${u.tag} ${u.tagAmber}`}>
                <Lock size={12} aria-hidden="true" />
                Admin only
              </span>
            ) : showPdf ? (
              <button
                type="button"
                className={o.pdfBtn}
                onClick={(event) =>
                  // The signed-pdf route verifies a Bearer token, which a plain
                  // link cannot send; the viewer fetches it with the token.
                  viewer.showDocument(
                    `/api/portal/onboarding/signed-pdf?userId=${encodeURIComponent(item.userId)}&itemId=${encodeURIComponent(item.itemId)}`,
                    `${item.itemLabel}, signed by ${name}`,
                    authHeaders,
                    event.currentTarget
                  )
                }
              >
                <FileText size={16} aria-hidden="true" />
                Signed PDF
              </button>
            ) : null}
            {markable ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                disabled={working}
                onClick={() => {
                  setFailure(null);
                  setFixingId(null);
                  setMarkingId(item.id);
                }}
              >
                Mark complete
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <AdminSheet title={name} onClose={onClose}>
        <div className={`${u.sheetPad} ${t.sheetBody}`}>
          {notice ? (
            <AdminNotice tone="ok" onDismiss={() => setNotice('')}>
              {notice}
            </AdminNotice>
          ) : null}
          {waiting.length > 0 ? (
            <ul className={o.items}>{waiting.map(renderItem)}</ul>
          ) : (
            <p className={u.hint}>Nothing of theirs is waiting on you.</p>
          )}
          {rest.length > 0 ? (
            <details className={t.fold}>
              <summary>Rest of their checklist ({rest.length})</summary>
              <ul className={o.items}>{rest.map(renderItem)}</ul>
            </details>
          ) : null}
        </div>
      </AdminSheet>
      {viewer.viewer}
    </>
  );
}
