'use client';

import { useState, type ChangeEvent } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { ImportField, PersonView } from '@/lib/employeeImport/plan';
import { AdminEmpty, AdminNotice } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import e from './employee-data.module.css';

const MAX_BYTES = 2 * 1024 * 1024;

const FIELD_LABEL: Record<ImportField, string> = {
  phone: 'Phone',
  address: 'Address',
  shirt: 'Shirt',
  ssn: 'SSN',
  dl: "Driver's license",
};

interface ImportResponse {
  sheetRows: number;
  matched: number;
  unmatchedRows: number;
  skipped: { name: string; reason: string }[];
  people: PersonView[];
  updated?: number;
  failed?: number;
}

function Tags({ fields, tone }: { fields: ImportField[]; tone?: string }) {
  if (fields.length === 0) return <span className={e.none}>—</span>;
  return (
    <span className={e.tags}>
      {fields.map((field) => (
        <span key={field} className={`${u.tag} ${tone ?? ''}`}>
          {FIELD_LABEL[field]}
        </span>
      ))}
    </span>
  );
}

/** The owner's employee spreadsheet import: the Import half of the Employee data page. */
export function EmployeeImportManager() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [inputKey, setInputKey] = useState(0);

  const send = async (mode: 'preview' | 'apply', upload: File): Promise<ImportResponse> => {
    const form = new FormData();
    form.set('mode', mode);
    form.set('file', upload);
    const token = await getIdToken();
    const res = await fetch('/api/portal/admin/employee-import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'The request failed');
    return json as ImportResponse;
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setPreview(null);
    setConfirming(false);
    setError('');
    if (picked && picked.size > MAX_BYTES) {
      setFile(null);
      setError('That file is over 2 MB.');
      return;
    }
    setFile(picked);
    if (picked) setResult(null);
  };

  const check = async () => {
    if (!file) return;
    setBusy('preview');
    setError('');
    setResult(null);
    try {
      setPreview(await send('preview', file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check failed');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy('apply');
    setError('');
    try {
      const json = await send('apply', file);
      setResult(json);
      setPreview(null);
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed');
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  const shown = result ?? preview;
  const toUpdate = preview ? preview.people.filter((person) => person.willFill.length > 0).length : 0;
  const peopleWord = (count: number) => (count === 1 ? 'person' : 'people');

  return (
    <>
      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}
      {result ? (
        <AdminNotice tone={result.failed ? 'warn' : 'ok'}>
          Updated {result.updated ?? 0} {peopleWord(result.updated ?? 0)}.
          {result.failed ? ` ${result.failed} could not be saved and were left unchanged.` : ''}
        </AdminNotice>
      ) : null}

      <section className={s.panel} aria-labelledby="import-file-heading">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="import-file-heading" className={s.kicker}>
            Import
          </h2>
          {preview ? <span className={u.panelMeta}>{toUpdate} to update</span> : null}
        </div>
        <div className={`${u.panelBody} ${u.formGrid}`}>
          <div className={u.field}>
            <label className={u.label} htmlFor="import-file">
              Employee sheet (.xlsx)
            </label>
            <input
              key={inputKey}
              id="import-file"
              className={`${u.input} ${u.fileInput}`}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onPick}
              disabled={busy !== null}
            />
            <p className={u.hint}>
              Fills empty profile fields for active portal users from the employee spreadsheet. Anything already in
              the portal stays as it is. Up to 2 MB. The file is read on the server and not stored. Phone, address,
              shirt size, SSN and driver&apos;s license fill in only where the portal has nothing yet.
            </p>
          </div>
          <div className={u.btnRow}>
            <button
              type="button"
              className={`${s.btnPrimary} ${u.primarySm}`}
              onClick={check}
              disabled={!file || busy !== null}
            >
              {busy === 'preview' ? 'Checking…' : 'Check file'}
            </button>
          </div>

          {preview && toUpdate > 0 && !confirming ? (
            <div className={u.btnRow}>
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                onClick={() => setConfirming(true)}
                disabled={busy !== null}
              >
                Import {toUpdate} {peopleWord(toUpdate)}
              </button>
            </div>
          ) : null}

          {preview && confirming ? (
            <div className={e.confirm} role="alertdialog" aria-labelledby="import-confirm-q">
              <p id="import-confirm-q" className={e.confirmText}>
                Import {toUpdate} {peopleWord(toUpdate)} now?
                <span className={e.confirmSub}>
                  Only empty fields are filled. Nothing already in the portal changes.
                </span>
              </p>
              <div className={u.btnRow}>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${u.sm}`}
                  onClick={() => setConfirming(false)}
                  disabled={busy === 'apply'}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`${s.btnPrimary} ${u.primarySm}`}
                  onClick={apply}
                  disabled={busy === 'apply'}
                >
                  {busy === 'apply' ? 'Importing…' : `Import ${toUpdate} ${peopleWord(toUpdate)}`}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {shown ? (
        <>
          <section className={s.panel} aria-labelledby="import-people-heading">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="import-people-heading" className={s.kicker}>
                {result ? 'Imported' : 'Preview'}
              </h2>
              <span className={e.summary}>
                <span>{shown.sheetRows} rows in the sheet</span>
                <span>{shown.matched} matched</span>
                <span>{shown.unmatchedRows} rows with no portal user</span>
              </span>
            </div>
            {shown.people.length === 0 ? (
              <AdminEmpty title="Nobody matched">
                No active portal user matched a row by email or full name.
              </AdminEmpty>
            ) : (
              <ul className={`${u.rows} ${e.cols}`}>
                <li className={u.tHead} aria-hidden="true">
                  <span>Person</span>
                  <span>{result ? 'Filled' : 'Will fill'}</span>
                  <span>Kept from portal</span>
                  <span>Issues</span>
                </li>
                {shown.people.map((person, index) => (
                  <li key={`${person.name}-${index}`} className={u.row}>
                    <span className={`${u.cellMain} ${u.personName}`}>
                      <span>{person.name}</span>
                    </span>
                    <span className={u.cell} data-label={result ? 'Filled' : 'Will fill'}>
                      <Tags fields={person.willFill} tone={u.tagLime} />
                    </span>
                    <span className={u.cell} data-label="Kept from portal">
                      <Tags fields={person.keptExisting} />
                    </span>
                    <span className={u.cell} data-label="Issues">
                      {person.issues.length ? (
                        <ul className={e.issues}>
                          {person.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className={e.none}>—</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {shown.skipped.length ? (
            <section className={s.panel} aria-labelledby="import-skipped-heading">
              <div className={`${s.panelHead} ${u.band}`}>
                <h2 id="import-skipped-heading" className={s.kicker}>
                  Skipped
                </h2>
                <span className={u.panelMeta}>{shown.skipped.length}</span>
              </div>
              <ul className={`${u.rows} ${e.skipCols}`}>
                <li className={u.tHead} aria-hidden="true">
                  <span>Person</span>
                  <span>Why</span>
                </li>
                {shown.skipped.map((person, index) => (
                  <li key={`${person.name}-${index}`} className={u.row}>
                    <span className={`${u.cellMain} ${u.personName}`}>
                      <span>{person.name}</span>
                    </span>
                    <span className={u.cell} data-label="Why">
                      {person.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
