'use client';

import { useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { downloadBlob } from '@/lib/export/csv';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import e from './employee-data.module.css';

const FILENAME = /filename="([^"]+)"/;

/** The owner's full employee data export (.xlsx with full SSN and DL#): the Export half of the Employee data page. */
export function EmployeeExportPanel() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The route verifies a Bearer token, which a plain link cannot send, so the
  // file is fetched with the token and saved from a blob.
  const download = async () => {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/portal/admin/employee-export', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'The export failed');
      }
      const filename = FILENAME.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? '3C-employee-data.xlsx';
      downloadBlob(filename, await res.blob());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className={s.panel} aria-labelledby="export-heading">
      <div className={`${s.panelHead} ${u.band}`}>
        <h2 id="export-heading" className={s.kicker}>
          Export
        </h2>
      </div>
      <div className={`${u.panelBody} ${u.formGrid}`}>
        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        ) : null}
        {done ? (
          <AdminNotice tone="ok" onDismiss={() => setDone(false)}>
            Downloaded. Delete the file when you are done with it.
          </AdminNotice>
        ) : null}
        <p className={u.hint}>
          Downloads everyone&apos;s info including full SSN and license numbers. Every export is logged under your
          name. Don&apos;t email this file; delete it after use.
        </p>

        {confirming ? (
          <div className={e.confirm} role="alertdialog" aria-labelledby="export-confirm-q">
            <p id="export-confirm-q" className={e.confirmText}>
              Download everyone&apos;s full SSN and license numbers?
              <span className={e.confirmSub}>This export is logged under your name.</span>
            </p>
            <div className={u.btnRow}>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Back
              </button>
              <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={download} disabled={busy}>
                {busy ? 'Preparing…' : 'Download'}
              </button>
            </div>
          </div>
        ) : (
          <div className={u.btnRow}>
            <button
              type="button"
              className={`${s.btnPrimary} ${u.primarySm}`}
              onClick={() => {
                setDone(false);
                setConfirming(true);
              }}
            >
              Download employee data
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
