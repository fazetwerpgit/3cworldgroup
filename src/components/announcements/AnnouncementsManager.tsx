'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type AnnouncementView,
} from '@/lib/announcements/schedule';
import { StatusDot, type Tone } from '@/components/portal/admin-d/AdminUi';
import { AdminHead, Banner, EmptyState, LoadFailed, SkeletonRows, cx } from '@/components/portal/admin-ops/AdminKit';
import rep from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import s from '@/components/portal/admin-ops/admin-ops.module.css';
import a from './announcements.module.css';

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function dayLabel(iso: string | null): string {
  return iso ? DAY_FORMAT.format(new Date(iso)) : '';
}

function statusOf(item: AnnouncementView): { tone: Tone; label: string } {
  switch (item.status) {
    case 'scheduled':
      return { tone: 'blue', label: 'Scheduled' };
    case 'sending':
      return { tone: 'amber', label: 'Sending' };
    case 'sent':
      return {
        tone: 'lime',
        label: `Sent to ${item.sentCount.toLocaleString('en-US')}${item.failedCount ? ` · ${item.failedCount} failed` : ''}`,
      };
    case 'failed':
      return { tone: 'red', label: 'Failed' };
    default:
      return { tone: 'muted', label: 'Cancelled' };
  }
}

/** The owner's announcements page body. Its page wraps it in the owner gate. */
export function AnnouncementsManager() {
  const [items, setItems] = useState<AnnouncementView[]>([]);
  const [firstDay, setFirstDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendDate, setSendDate] = useState('');
  const [busy, setBusy] = useState<'test' | 'schedule' | 'count' | 'now' | null>(null);
  // The open "Send now" confirm: its idempotency key and who it would reach.
  const [sendNow, setSendNow] = useState<{ requestId: string; count: number } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/portal/announcements');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.announcements);
      setFirstDay(json.nextSendDate);
      setSendDate((current) => (current && current >= json.nextSendDate ? current : json.nextSendDate));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setLoadError('');
    setLoading(true);
    load();
  };

  const titleLeft = ANNOUNCEMENT_TITLE_MAX - title.trim().length;
  const bodyLeft = ANNOUNCEMENT_BODY_MAX - body.trim().length;
  const messageReady = title.trim().length > 0 && body.trim().length > 0 && titleLeft >= 0 && bodyLeft >= 0;

  const sendTest = async () => {
    setBusy('test');
    setNotice(null);
    try {
      const res = await authedFetch('/api/portal/announcements/test', {
        method: 'POST',
        body: JSON.stringify({ title, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send the test');
      setNotice({
        tone: 'ok',
        text: `Test sent to ${json.delivered} of your ${json.devices} device${json.devices === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to send the test' });
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    setBusy('schedule');
    setNotice(null);
    try {
      const res = await authedFetch('/api/portal/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body, sendDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to schedule');
      setNotice({ tone: 'ok', text: `Scheduled for ${dayLabel(`${sendDate}T17:00:00Z`)}, about 8 AM Central.` });
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to schedule' });
    } finally {
      setBusy(null);
    }
  };

  const openSendNow = async () => {
    setBusy('count');
    setNotice(null);
    try {
      const res = await authedFetch('/api/portal/announcements/recipients');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to count recipients');
      setSendNow({ requestId: crypto.randomUUID(), count: json.count });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to count recipients' });
    } finally {
      setBusy(null);
    }
  };

  const confirmSendNow = async () => {
    if (!sendNow) return;
    setBusy('now');
    setNotice(null);
    try {
      const res = await authedFetch('/api/portal/announcements/send-now', {
        method: 'POST',
        body: JSON.stringify({ title, body, requestId: sendNow.requestId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      setNotice({
        tone: 'ok',
        text: `Sent to ${json.sentCount} ${json.sentCount === 1 ? 'person' : 'people'}${
          json.failedCount ? `. ${json.failedCount} didn't get it.` : '.'
        }`,
      });
      setSendNow(null);
      setTitle('');
      setBody('');
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setBusy(null);
      await load();
    }
  };

  const cancel = async (id: string) => {
    setCancellingId(id);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/portal/announcements/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to cancel');
      setConfirmId(null);
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to cancel' });
    } finally {
      setCancellingId(null);
    }
  };

  const scheduledCount = items.filter((item) => item.status === 'scheduled').length;

  return (
    <div className={s.page}>
      <AdminHead
        title="Announcements"
        lede="A phone notification to every active user who has notifications on. Tapping it opens the portal."
        count={loading || loadError ? null : scheduledCount}
        countLabel="scheduled"
      />

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}

      <div className={a.layout}>
        <section className={rep.panel} aria-labelledby="announce-new">
          <div className={cx(rep.panelHead, u.band)}>
            <h2 id="announce-new" className={rep.kicker}>
              New announcement
            </h2>
          </div>
          <div className={a.form}>
            <div className={s.field}>
              <div className={a.labelRow}>
                <label htmlFor="announce-title" className={s.label}>
                  Title
                </label>
                <span className={cx(a.count, titleLeft < 0 && a.countOver)} aria-live="polite">
                  {title.trim().length}/{ANNOUNCEMENT_TITLE_MAX}
                </span>
              </div>
              <input
                id="announce-title"
                className={s.input}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSendNow(null);
                }}
                maxLength={ANNOUNCEMENT_TITLE_MAX + 10}
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>

            <div className={s.field}>
              <div className={a.labelRow}>
                <label htmlFor="announce-body" className={s.label}>
                  Message
                </label>
                <span className={cx(a.count, bodyLeft < 0 && a.countOver)} aria-live="polite">
                  {body.trim().length}/{ANNOUNCEMENT_BODY_MAX}
                </span>
              </div>
              <textarea
                id="announce-body"
                className={cx(s.input, s.textarea, a.message)}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSendNow(null);
                }}
                maxLength={ANNOUNCEMENT_BODY_MAX + 20}
                rows={4}
              />
            </div>

            <div className={s.field}>
              <label htmlFor="announce-date" className={s.label}>
                Send on
              </label>
              <input
                id="announce-date"
                type="date"
                className={s.input}
                value={sendDate}
                min={firstDay || undefined}
                onChange={(e) => setSendDate(e.target.value)}
                disabled={loading}
              />
              <p className={s.hint}>Sends at about 8 AM Central.</p>
            </div>

            <div className={a.actions}>
              <button
                type="button"
                className={cx(s.btn, a.testBtn)}
                onClick={sendTest}
                disabled={!messageReady || busy !== null}
              >
                {busy === 'test' ? 'Sending…' : 'Send a test to me'}
              </button>
              <button
                type="button"
                className={s.btn}
                onClick={openSendNow}
                disabled={!messageReady || busy !== null || sendNow !== null}
              >
                {busy === 'count' ? 'Counting…' : 'Send now'}
              </button>
              <button
                type="button"
                className={s.btnLime}
                onClick={schedule}
                disabled={!messageReady || !sendDate || busy !== null}
              >
                {busy === 'schedule' ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>

            {sendNow ? (
              <div className={a.confirm} role="alertdialog" aria-labelledby="announce-now-q">
                <p id="announce-now-q" className={a.confirmText}>
                  Send to {sendNow.count.toLocaleString('en-US')} {sendNow.count === 1 ? 'person' : 'people'} now?
                  <span className={a.confirmSub}>It goes out right away and can&apos;t be taken back.</span>
                </p>
                <div className={a.confirmBtns}>
                  <button type="button" className={s.btnGhost} onClick={() => setSendNow(null)} disabled={busy === 'now'}>
                    Back
                  </button>
                  <button
                    type="button"
                    className={s.btnLime}
                    onClick={confirmSendNow}
                    disabled={busy === 'now' || sendNow.count === 0}
                  >
                    {busy === 'now' ? 'Sending…' : 'Send now'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className={cx(rep.panel, s.listPanel)} aria-labelledby="announce-history">
          <div className={cx(rep.panelHead, u.band)}>
            <h2 id="announce-history" className={rep.kicker}>
              Scheduled and sent
            </h2>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : loadError ? (
            <LoadFailed what="announcements" onRetry={retry} />
          ) : items.length === 0 ? (
            <EmptyState title="No announcements yet" body="Scheduled announcements show here with how many people got them." />
          ) : (
            <ul className={a.list}>
              {items.map((item) => {
                const status = statusOf(item);
                const when = item.status === 'sent' || item.status === 'failed' ? item.sentAt ?? item.sendAt : item.sendAt;
                return (
                  <li key={item.id} className={a.row}>
                    <div className={a.rowHead}>
                      <p className={a.rowTitle}>{item.title}</p>
                      {item.status === 'scheduled' && confirmId !== item.id ? (
                        <button type="button" className={cx(s.btnGhost, a.rowCancel)} onClick={() => setConfirmId(item.id)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <p className={a.rowBody}>{item.body}</p>
                    <div className={a.rowMeta}>
                      <StatusDot tone={status.tone}>{status.label}</StatusDot>
                      {when ? (
                        <span>
                          {dayLabel(when)}
                          {item.status === 'scheduled' ? ', about 8 AM' : ''}
                        </span>
                      ) : null}
                    </div>
                    {confirmId === item.id ? (
                      <div className={s.confirm} role="alertdialog" aria-label={`Cancel ${item.title}`}>
                        <p className={s.confirmText}>
                          Cancel this announcement?
                          <span className={s.confirmSub}>Nobody will get it.</span>
                        </p>
                        <div className={s.confirmBtns}>
                          <button
                            type="button"
                            className={s.btnGhost}
                            onClick={() => setConfirmId(null)}
                            disabled={cancellingId === item.id}
                          >
                            Keep it
                          </button>
                          <button
                            type="button"
                            className={s.btnDanger}
                            onClick={() => cancel(item.id)}
                            disabled={cancellingId === item.id}
                          >
                            {cancellingId === item.id ? 'Cancelling…' : 'Cancel send'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
