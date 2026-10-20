'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { firstName } from '@/lib/solar/consultantContact';
import { googleStatusOf, type GoogleCalendarStatus } from '@/lib/solar/google/status';
import { StatusDot } from '@/components/portal/admin-d/AdminUi';
import { ConfirmStrip, cx } from '@/components/portal/admin-ops/AdminKit';
import ops from '@/components/portal/admin-ops/admin-ops.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import st from './solar-setup.module.css';
import { api, failure } from './setupApi';

// One consultant's Google Calendar row in Admin > Solar > Setup. Each
// consultant connects THEIR OWN Google account, so only the signed-in
// person's card can connect; other cards show the status, and an admin may
// disconnect them. On the web the Google sign-in is a normal navigation back
// to this page. In the 3C iOS app Google refuses sign-in inside the WebView,
// so the URL goes out through window.open, which the app's link handling
// (lib/app/links.ts) hands to the shell's browser sheet; this row then polls
// until the connection shows up.

const CONNECT_URL = '/api/portal/solar/google/connect';
const HELP = "Bookings go on your Google Calendar with their own Meet link, and homeowners only see times you're free.";
/** App flow: how often, and for how long, the row checks whether the sign-in finished. */
const POLL_MS = 3000;
const POLL_FOR_MS = 5 * 60_000;

export function GoogleCalendarRow({
  uid,
  name,
  own,
  canConnect,
  status,
  onChange,
}: {
  uid: string;
  name: string;
  /** The signed-in person's own card: the only one that can connect. */
  own: boolean;
  /** False until this consultant is saved (the connection lives on their saved doc). */
  canConnect: boolean;
  status: GoogleCalendarStatus | undefined;
  onChange: (uid: string, status: GoogleCalendarStatus | undefined) => void;
}) {
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const labelId = `gcal-${uid}`;
  const before = useRef<string>('');

  const connected = status?.connected === true;
  const broken = !connected && status?.needsReconnect === true;
  const who = firstName(name) || name;

  // App flow: the sign-in finishes in the browser sheet, so look for the new
  // connection while waiting (and at once when the page is shown again).
  const check = useCallback(async () => {
    try {
      const data = await api(CONNECT_URL);
      const next = googleStatusOf(data.googleCalendar);
      if (next?.connected && next.connectedAt !== before.current) {
        setWaiting(false);
        onChange(uid, next);
      }
    } catch {
      // keep waiting; the next tick tries again
    }
  }, [onChange, uid]);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) {
        setWaiting(false);
        return;
      }
      void check();
    }, POLL_MS);
    const onShow = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [waiting, check]);

  const connect = async () => {
    setBusy('connect');
    setError('');
    const inApp = isNativeApp();
    try {
      const data = await api(CONNECT_URL, { method: 'POST', body: JSON.stringify({ from: inApp ? 'app' : 'web' }) });
      const url = typeof data.url === 'string' ? data.url : '';
      if (!url) throw new Error('');
      if (inApp) {
        before.current = status?.connectedAt ?? '';
        window.open(url, '_blank');
        setWaiting(true);
        setBusy(null);
      } else {
        // Leaves the page; Google sends the browser back to Setup.
        window.location.assign(url);
      }
    } catch (err) {
      setError(failure(err, "Couldn't open Google sign-in. Try again."));
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setError('');
    try {
      const path = own ? CONNECT_URL : `${CONNECT_URL}?uid=${encodeURIComponent(uid)}`;
      await api(path, { method: 'DELETE' });
      setConfirming(false);
      onChange(uid, undefined);
    } catch (err) {
      setError(failure(err, "Couldn't disconnect. Try again."));
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  };

  const state = connected ? (
    <StatusDot tone="lime">{status?.email ? `Connected as ${status.email}` : 'Connected'}</StatusDot>
  ) : waiting ? (
    <StatusDot tone="blue">Waiting for Google</StatusDot>
  ) : broken ? (
    <StatusDot tone="amber">Needs reconnecting</StatusDot>
  ) : (
    <StatusDot tone="muted">Not connected</StatusDot>
  );

  let note = '';
  if (waiting) note = 'Finish signing in to Google in the window that opened. This updates when you come back.';
  else if (broken) {
    note = own
      ? "Google stopped accepting the connection. Bookings still work, but they aren't added to your calendar until you reconnect."
      : `Google stopped accepting ${who}’s connection. They need to reconnect from their own card.`;
  } else if (connected && status?.freeBusy === false) {
    note = own
      ? "Free/busy wasn't allowed, so homeowners still see every open time. Reconnect and allow it to hide busy times."
      : 'Free/busy wasn’t allowed, so their busy times aren’t hidden from homeowners.';
  } else if (own && !connected && !canConnect) note = 'Save your hours first, then connect.';

  const connectLabel = busy === 'connect' ? 'Opening Google…' : broken || (connected && status?.freeBusy === false) ? 'Reconnect' : 'Connect Google Calendar';
  const showConnect = own && (!connected || status?.freeBusy === false);
  const showDisconnect = connected || broken;

  return (
    <div className={st.gcal} role="group" aria-labelledby={labelId}>
      <div className={st.gcalText}>
        <span className={st.gcalLabel} id={labelId}>
          Google Calendar
        </span>
        <span className={st.gcalState}>{state}</span>
        {note ? (
          <p className={cx(st.help, st.gcalNote, broken && st.gcalWarn)} role={waiting ? 'status' : undefined}>
            {note}
          </p>
        ) : null}
        {own && !connected && !broken && !waiting ? <p className={st.help}>{HELP}</p> : null}
        {error ? (
          <p className={cx(u.hint, u.hintError)} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {confirming ? (
        <ConfirmStrip
          label={own ? 'Disconnect your Google Calendar?' : `Disconnect ${who}’s Google Calendar?`}
          sub="New bookings stop going on the calendar and busy times stop hiding slots. Booked ones stay on it."
          confirmLabel="Disconnect"
          busyLabel="Disconnecting…"
          confirming={busy === 'disconnect'}
          onCancel={() => setConfirming(false)}
          onConfirm={disconnect}
        />
      ) : showConnect || showDisconnect ? (
        <div className={cx(u.btnRow, st.gcalActions)}>
          {showConnect ? (
            <button
              type="button"
              className={cx(ops.btn, u.sm)}
              disabled={busy !== null || !canConnect}
              onClick={connect}
            >
              {waiting ? 'Open Google again' : connectLabel}
            </button>
          ) : null}
          {showDisconnect ? (
            <button
              type="button"
              className={cx(ops.btnGhost, u.sm)}
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
