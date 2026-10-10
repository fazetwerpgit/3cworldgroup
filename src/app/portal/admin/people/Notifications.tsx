'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { PERSON_PUSH_LABEL, type PersonPushState, type PushStatusRow } from '@/lib/push/pushNudge';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import n from './notifications.module.css';

const TONE: Record<PersonPushState, Tone> = {
  on: 'lime',
  'not-installed': 'amber',
  'never-allowed': 'amber',
  blocked: 'red',
  unknown: 'muted',
};

/** "checked 5 min ago", "checked 3 h ago", "checked yesterday", "checked Oct 2". */
export function checkedLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'not checked yet';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return 'not checked yet';
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return 'checked just now';
  if (minutes < 60) return `checked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `checked ${hours} h ago`;
  if (hours < 48) return 'checked yesterday';
  return `checked ${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };
}

/**
 * People > Notifications: who can get push on their phone, from what each
 * person's device last reported. "Require" turns their dismissible banner into
 * a full-screen sheet on every open until push works (users/{uid}.pushRequired).
 */
export function Notifications() {
  const [rows, setRows] = useState<PushStatusRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/portal/admin/push', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRows(body.users ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: PushStatusRow) => {
    const required = !row.required;
    setError('');
    setSaving((m) => ({ ...m, [row.uid]: true }));
    setRows((list) => list?.map((r) => (r.uid === row.uid ? { ...r, required } : r)) ?? list);
    try {
      const res = await fetch('/api/portal/admin/push', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ uid: row.uid, required }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setRows((list) => list?.map((r) => (r.uid === row.uid ? { ...r, required: !required } : r)) ?? list);
      setError(`Couldn't change ${row.name}. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setSaving((m) => ({ ...m, [row.uid]: false }));
    }
  };

  const off = rows?.filter((r) => r.state !== 'on').length ?? 0;

  return (
    <AdminGate roles={['admin']}>
      <div className={u.page}>
        <AdminPageHead
          title="Notifications"
          meta={
            rows ? (
              <>
                <b>{off}</b> of {rows.length} {rows.length === 1 ? 'person' : 'people'} can&apos;t get notifications
              </>
            ) : null
          }
        />

        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        ) : null}

        <section className={s.panel} aria-labelledby="push-status-heading">
          <div className={`${s.panelHead} ${u.band}`}>
            <h2 id="push-status-heading" className={s.kicker}>
              Active people
            </h2>
            {rows ? <span className={u.panelMeta}>{rows.length}</span> : null}
          </div>

          {loadError && !rows ? (
            <AdminFailed what="notification status" detail={loadError} onRetry={() => void load()} />
          ) : !rows ? (
            <AdminSkeletonRows rows={5} />
          ) : rows.length === 0 ? (
            <AdminEmpty title="No active people yet" />
          ) : (
            <ul className={u.rows}>
              {rows.map((row) => (
                <li key={row.uid} className={u.row}>
                  <span className={u.personText}>
                    <span className={u.personName}>
                      <span>{row.name}</span>
                    </span>
                    <span className={n.state}>
                      <StatusDot tone={TONE[row.state]}>{PERSON_PUSH_LABEL[row.state]}</StatusDot>
                      <span className={n.checked}>{checkedLabel(row.checkedAt)}</span>
                    </span>
                  </span>
                  <span className={n.require}>
                    <span className={n.requireLabel} aria-hidden="true">
                      Require
                    </span>
                    <button
                      type="button"
                      className={u.switch}
                      aria-pressed={row.required}
                      aria-label={`Require notifications for ${row.name}`}
                      disabled={!!saving[row.uid]}
                      onClick={() => void toggle(row)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminGate>
  );
}
