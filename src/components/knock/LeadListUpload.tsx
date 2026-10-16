'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { LeadSkipReason } from '@/lib/knock/leadImport';
import type { LEAD_ASSIGN_FROM_FILE, LeadImportEvent, LeadPlanSummary } from '@/lib/knock/leadImportServer';
import { AdminFailed, AdminNotice, AdminPageHead, AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import l from './lead-lists.module.css';

interface Options {
  campaigns: { id: string; name: string; type: string }[];
  people: { uid: string; name: string }[];
  live: boolean;
  maxBytes: number;
  maxRows: number;
}

type Preview = LeadPlanSummary & { live: boolean };

type Done = Extract<LeadImportEvent, { type: 'done' }>;

/** How each left-out row reads in the rows sentence ("10 listed twice"). */
const SKIPPED: Record<LeadSkipReason, string> = {
  'not-door-knock-allowed': 'not allowed to knock',
  'no-coordinates': 'without a map location',
  'not-located': "couldn't be located",
  'no-pack': 'without a pack',
  'repeated-row': 'listed twice',
};

const FORMAT: Record<LeadPlanSummary['format'], string> = {
  att: 'AT&T lead list',
  sr: 'SalesRabbit file',
  generic: 'Lead list',
};

/** The "As in the file" choice (typed against the server's constant; a value import would bundle the server module). */
const FROM_FILE: typeof LEAD_ASSIGN_FROM_FILE = 'file';

const n = (count: number) => count.toLocaleString('en-US');
const doorsWord = (count: number) => `${n(count)} ${count === 1 ? 'door' : 'doors'}`;

/** Where every row went: "3,486 rows: 596 houses, 2,880 apartments in 134 buildings, 10 listed twice." */
export function rowsSentence({ rows, rowsBreakdown: b, skipped }: Pick<LeadPlanSummary, 'rows' | 'rowsBreakdown' | 'skipped'>): string {
  const parts: string[] = [];
  if (b.houseRows > 0) parts.push(`${n(b.houseRows)} ${b.houseRows === 1 ? 'house' : 'houses'}`);
  if (b.apartmentRows > 0) {
    parts.push(
      `${n(b.apartmentRows)} ${b.apartmentRows === 1 ? 'apartment' : 'apartments'} in ${n(b.buildings)} ${b.buildings === 1 ? 'building' : 'buildings'}`
    );
  }
  for (const skip of skipped) parts.push(`${n(skip.count)} ${SKIPPED[skip.reason]}`);
  return `${n(rows)} ${rows === 1 ? 'row' : 'rows'}: ${parts.join(', ')}.`;
}

/** "Not Home (120), Go Back (8) and 3 more": names with their row counts, the first few only. */
function counted(items: { label: string; count: number }[], max = 6): string {
  const shown = items.slice(0, max).map((item) => `${item.label} (${n(item.count)})`);
  return items.length > max ? `${shown.join(', ')} and ${items.length - max} more` : shown.join(', ');
}

const total = (items: { count: number }[]) => items.reduce((sum, item) => sum + item.count, 0);
/** "1 row has" / "3 rows have". */
const rowsHave = (count: number) => `${n(count)} ${count === 1 ? 'row has' : 'rows have'}`;

/** The preview's plain-English lines under the figures (only the ones that apply). */
export function previewLines(p: Omit<LeadPlanSummary, 'campaign' | 'packs'>): string[] {
  const lines = [rowsSentence(p)];
  if (p.mdus > 0) {
    lines.push(`The new doors include ${n(p.mdus)} apartment ${p.mdus === 1 ? 'building' : 'buildings'} with ${n(p.units)} units.`);
  }
  if (p.geocoded > 0) {
    lines.push(
      `${n(p.geocoded)} ${p.geocoded === 1 ? 'row was' : 'rows were'} placed on the map from the address${
        p.approximate > 0 ? `, ${n(p.approximate)} of them approximately located` : ''
      }.`
    );
  }
  if (p.notLocated > 0) {
    lines.push(
      `${n(p.notLocated)} couldn't be located. Only US addresses can be looked up; others need Latitude and Longitude columns.`
    );
  }
  if (p.statuses.length > 0) {
    lines.push(
      `${rowsHave(total(p.statuses))} a status that comes in as the door's result: ${counted(
        p.statuses.map((x) => ({ label: x.name, count: x.count }))
      )}.`
    );
  }
  if (p.unmatchedStatuses.length > 0) {
    lines.push(
      `${rowsHave(total(p.unmatchedStatuses))} a status that matches no result in this campaign, so those doors come in not knocked: ${counted(
        p.unmatchedStatuses.map((x) => ({ label: x.name, count: x.count }))
      )}.`
    );
  }
  if (p.fromFile) {
    if (p.fileAssignees === 0) lines.push("This file doesn't say who gets each door, so nobody gets them yet.");
    if (p.assignees.length > 0) {
      lines.push(`Goes to the people the file names: ${counted(p.assignees.map((x) => ({ label: x.name, count: x.count })))}.`);
    }
    if (p.unmatchedAssignees.length > 0) {
      lines.push(
        `${n(total(p.unmatchedAssignees))} ${total(p.unmatchedAssignees) === 1 ? 'row names' : 'rows name'} someone not in the portal, so nobody gets those doors yet: ${counted(
          p.unmatchedAssignees.map((x) => ({ label: x.email, count: x.count }))
        )}.`
      );
    }
  }
  if (p.appointments.kept > 0) lines.push(`${n(p.appointments.kept)} ${p.appointments.kept === 1 ? 'appointment' : 'appointments'} kept.`);
  if (p.appointments.ignored > 0) {
    lines.push(
      `${n(p.appointments.ignored)} ${p.appointments.ignored === 1 ? 'appointment' : 'appointments'} left out: the status takes no appointment, or the date couldn't be read.`
    );
  }
  const extras = [
    p.contacts > 0 ? `${n(p.contacts)} with contact details` : '',
    p.notes > 0 ? `${n(p.notes)} with notes` : '',
  ].filter(Boolean);
  if (extras.length > 0) lines.push(`${extras.join(', ')}.`);
  if (p.addressPending > 0) {
    lines.push(
      `${doorsWord(p.addressPending)} have no street address yet. Each fills in the first time someone opens that door in the app.`
    );
  }
  return lines;
}

/** POSTs `{ csvText, campaignId, assignTo }`, gzipped when the browser can (big files fit Vercel's body cap). */
async function postLeads(path: string, payload: { csvText: string; campaignId: string; assignTo: string | null }) {
  const json = JSON.stringify(payload);
  let body: BodyInit = json;
  let type = 'application/json';
  if (typeof CompressionStream !== 'undefined') {
    body = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    type = 'application/gzip';
  }
  const token = await getIdToken();
  return fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': type },
    body,
  });
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => ({}));
  return typeof json.error === 'string' ? json.error : fallback;
}

/**
 * The owner's lead-list upload: an AT&T lead list or SalesRabbit export becomes doors in a 3C Doors
 * campaign. Check file shows what the server would add; Add writes it (the server plans the file
 * again, never trusting this page). Its page wraps it in the owner gate.
 */
export function LeadListUpload() {
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ handled: number; total: number } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/portal/knock/leads', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error(await errorOf(res, 'The request failed'));
      setOptions((await res.json()) as Options);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The request failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setPreview(null);
    setConfirming(false);
    setError('');
  };

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    reset();
    setFile(null);
    if (!picked) return;
    if (options && picked.size > options.maxBytes) {
      setError(`That file is over ${Math.round(options.maxBytes / 1024 / 1024)} MB. Split it into smaller files.`);
      return;
    }
    setDone(null);
    setFile({ name: picked.name, text: await picked.text() });
  };

  const check = async () => {
    if (!file || !campaignId) return;
    setBusy('preview');
    reset();
    setDone(null);
    try {
      const res = await postLeads('/api/portal/knock/leads/preview', {
        csvText: file.text,
        campaignId,
        assignTo: assignTo || null,
      });
      if (!res.ok) throw new Error(await errorOf(res, 'Checking the file failed'));
      setPreview((await res.json()) as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checking the file failed');
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!file || !preview) return;
    setBusy('import');
    setError('');
    setProgress({ handled: 0, total: preview.doors });
    try {
      const res = await postLeads('/api/portal/knock/leads/import', {
        csvText: file.text,
        campaignId,
        assignTo: assignTo || null,
      });
      if (!res.ok || !res.body) throw new Error(await errorOf(res, 'Adding the doors failed'));
      // NDJSON: progress lines after each batched write, then one done or error line.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let finished: Done | null = null;
      for (;;) {
        const { done: ended, value } = await reader.read();
        if (value) buffer += value;
        const lines = buffer.split('\n');
        buffer = ended ? '' : (lines.pop() ?? '');
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as LeadImportEvent;
          if (event.type === 'progress') setProgress({ handled: event.handled, total: event.total });
          else if (event.type === 'error') throw new Error(event.error);
          else finished = event;
        }
        if (ended) break;
      }
      if (!finished) throw new Error('The connection dropped. Upload the same file again to add the rest.');
      setDone(finished);
      setPreview(null);
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adding the doors failed');
    } finally {
      setBusy(null);
      setConfirming(false);
      setProgress(null);
    }
  };

  if (loadError) {
    return (
      <div className={u.page}>
        <AdminFailed what="campaigns" detail={loadError} onRetry={load} />
      </div>
    );
  }
  if (!options) {
    return (
      <div className={u.page}>
        <AdminSkeletonRows rows={3} label="Loading campaigns" />
      </div>
    );
  }

  const live = preview?.live ?? options.live;
  const canCheck = Boolean(file && campaignId) && busy === null;
  const campaignName = options.campaigns.find((c) => c.id === campaignId)?.name ?? '';

  return (
    <div className={u.page}>
      <AdminPageHead
        title="Lead lists"
        sub="Check a file first to see what it would add. Nothing is saved until you confirm."
      />

      {!live ? (
        <AdminNotice tone="warn">
          Adding doors from the portal is switched off for now. You can still check a file to see what it would add.
        </AdminNotice>
      ) : null}
      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}
      {done ? (
        <AdminNotice tone="ok">
          Added {doorsWord(done.written)} to {done.summary.campaign.name}
          {done.summary.assignee ? `, given to ${done.summary.assignee.name}` : ''}
          {done.summary.fromFile ? ', given out as the file says' : ''}.
          {done.alreadyThere ? ` ${doorsWord(done.alreadyThere)} were already there and were left alone.` : ''}
        </AdminNotice>
      ) : null}

      <section className={s.panel} aria-labelledby="lead-upload-heading">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="lead-upload-heading" className={s.kicker}>
            Upload lead list
          </h2>
        </div>
        <div className={`${u.panelBody} ${u.formGrid}`}>
          {options.campaigns.length === 0 ? (
            <p className={u.hint}>There are no 3C Doors campaigns yet. Make one in the app first.</p>
          ) : null}
          <div className={`${u.formGrid} ${u.formGrid2}`}>
            <div className={u.field}>
              <label className={u.label} htmlFor="lead-campaign">
                Campaign
              </label>
              <span className={u.selectWrap}>
                <select
                  id="lead-campaign"
                  className={u.input}
                  value={campaignId}
                  onChange={(event) => {
                    setCampaignId(event.target.value);
                    reset();
                  }}
                  disabled={busy !== null}
                >
                  <option value="" disabled>
                    Choose a campaign
                  </option>
                  {options.campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </div>
            <div className={u.field}>
              <label className={u.label} htmlFor="lead-assign">
                Give the doors to
              </label>
              <span className={u.selectWrap}>
                <select
                  id="lead-assign"
                  className={u.input}
                  value={assignTo}
                  onChange={(event) => {
                    setAssignTo(event.target.value);
                    reset();
                  }}
                  disabled={busy !== null}
                >
                  <option value="">Nobody yet (hand them out in the app)</option>
                  <option value={FROM_FILE}>As in the file (its Assigned to column)</option>
                  {options.people.map((person) => (
                    <option key={person.uid} value={person.uid}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </div>
          </div>
          <div className={u.field}>
            <label className={u.label} htmlFor="lead-file">
              Lead file (.csv)
            </label>
            <input
              key={inputKey}
              id="lead-file"
              className={`${u.input} ${u.fileInput}`}
              type="file"
              accept=".csv,text/csv"
              onChange={onPick}
              disabled={busy !== null}
            />
            <p className={u.hint}>
              An AT&amp;T lead list, a SalesRabbit file, or any CSV with Latitude and Longitude or an Address with City or
              ZIP, up to {Math.round(options.maxBytes / 1024 / 1024)} MB and {n(options.maxRows)} rows. Doors already in
              the campaign are left alone, so the same file can be uploaded twice safely.
            </p>
          </div>
          <div className={u.btnRow}>
            <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={check} disabled={!canCheck}>
              {busy === 'preview' ? 'Checking the file (finding addresses on the map can take a minute)…' : 'Check file'}
            </button>
          </div>
        </div>
      </section>

      {preview ? (
        <section className={s.panel} aria-labelledby="lead-preview-heading">
          <div className={`${s.panelHead} ${u.band}`}>
            <h2 id="lead-preview-heading" className={s.kicker}>
              Preview
            </h2>
            <span className={u.panelMeta}>
              {FORMAT[preview.format]} · {n(preview.rows)} rows
            </span>
          </div>
          <div className={`${u.panelBody} ${u.formGrid}`}>
            <dl className={u.facts}>
              <div>
                <dt>New doors</dt>
                <dd className={u.num}>{n(preview.doors)}</dd>
              </div>
              <div>
                <dt>Packs</dt>
                <dd className={u.num}>{n(preview.packs.length)}</dd>
              </div>
              <div>
                <dt>Already in this campaign</dt>
                <dd className={u.num}>{n(preview.duplicates)}</dd>
              </div>
              <div>
                <dt>Goes to</dt>
                <dd>{preview.fromFile ? 'As in the file' : preview.assignee ? preview.assignee.name : 'Nobody yet'}</dd>
              </div>
            </dl>
            <ul className={l.notes}>
              {previewLines(preview).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {preview.doors > 0 && live && !confirming && busy === null ? (
              <div className={u.btnRow}>
                <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={() => setConfirming(true)}>
                  Add {doorsWord(preview.doors)}
                </button>
              </div>
            ) : null}
            {preview.doors === 0 ? <p className={u.hint}>Nothing new to add from this file.</p> : null}

            {confirming ? (
              <div className={l.confirm} role="alertdialog" aria-labelledby="lead-confirm-q">
                <p id="lead-confirm-q" className={l.confirmText}>
                  Add {doorsWord(preview.doors)} to {campaignName} now?
                  <span className={l.confirmSub}>
                    {preview.fromFile
                      ? 'They go to the people the file names.'
                      : preview.assignee
                        ? `They go to ${preview.assignee.name}.`
                        : 'Nobody has them yet: hand them out in the app.'}{' '}
                    Doors already there are not changed.
                  </span>
                </p>
                {progress ? (
                  <div className={l.progress} role="status">
                    <span className={s.track} aria-hidden="true">
                      <span
                        className={s.fill}
                        style={{ width: `${progress.total ? (progress.handled / progress.total) * 100 : 0}%` }}
                      />
                    </span>
                    <span>
                      {n(progress.handled)} of {doorsWord(progress.total)} saved
                    </span>
                  </div>
                ) : (
                  <div className={u.btnRow}>
                    <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setConfirming(false)}>
                      Back
                    </button>
                    <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={add}>
                      Add {doorsWord(preview.doors)}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {preview.packs.length > 0 ? (
            <ul className={`${u.rows} ${l.packCols}`}>
              <li className={u.tHead} aria-hidden="true">
                <span>Pack</span>
                <span>New doors</span>
                <span>In the campaign</span>
              </li>
              {preview.packs.map((pack) => (
                <li key={pack.packId} className={u.row}>
                  <span className={u.cellMain}>{pack.name}</span>
                  <span className={`${u.cell} ${u.num}`} data-label="New doors">
                    {n(pack.count)}
                  </span>
                  <span className={u.cell} data-label="In the campaign">
                    {pack.isNew ? <span className={`${u.tag} ${u.tagLime}`}>New pack</span> : 'Adds to this pack'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
