'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Download, FileText, Lock } from 'lucide-react';
import {
  AdminEmpty,
  AdminFailed,
  AdminNotice,
  AdminSkeletonRows,
  StatusDot,
} from '@/components/portal/admin-d/AdminUi';
import { useAttachmentViewer } from '@/components/portal/rep/ImageViewer';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { downloadBlob } from '@/lib/export/csv';
import type { OnboardingFileItem, OnboardingFileSummary } from '@/lib/onboarding/onboardingFile';
import { isAppleMobile, onboardingFileItemStatus, opensInViewer } from '@/lib/onboarding/onboardingFileStatus';
import { OnboardingCategoryLabels } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import o from '../onboarding/admin-onboarding.module.css';
import d from './user-detail.module.css';
import f from './onboarding-file.module.css';

// Stable (the viewer keys its PDF fetch on it): every onboarding-file route
// verifies a Bearer token, which a plain link cannot send.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return { Authorization: `Bearer ${token ?? ''}` };
}

const FILENAME = /filename="([^"]+)"/;

function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      // Share sheet on iOS / iPadOS only; Android and desktop download directly.
      isAppleMobile(navigator.userAgent, navigator.maxTouchPoints ?? 0) &&
      typeof navigator.share === 'function' &&
      !!navigator.canShare?.({ files: [file] })
    );
  } catch {
    return false;
  }
}

type UploadedFile = { name: string; url: string; contentType: string };

const PREFILL_LABELS: Record<string, string> = {
  taxClassification: 'Tax classification',
  accountType: 'Account type',
};

function itemMeta(item: OnboardingFileItem): string[] {
  const lines: string[] = [];
  const dates = [
    item.submittedAt ? `Submitted ${item.submittedAt}` : '',
    item.reviewedAt ? `Reviewed ${item.reviewedAt}${item.reviewerName ? ` by ${item.reviewerName}` : ''}` : '',
  ].filter(Boolean);
  if (dates.length) lines.push(dates.join('. '));
  if (item.signedWithoutStoredCopy) lines.push('Signed (no stored copy)');
  for (const [key, value] of Object.entries(item.prefill)) {
    lines.push(`${PREFILL_LABELS[key] ?? key}: ${value.replace(/_/g, ' ')}`);
  }
  if (item.reference) lines.push(`Reference: ${item.reference}`);
  return lines;
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? f.wide : undefined}>
      <dt>{label}</dt>
      <dd className={value ? undefined : f.empty}>{value || 'Not on file'}</dd>
    </div>
  );
}

/**
 * OWNER ONLY: everything on file for one person, with a single download. The
 * routes behind it refuse anyone but an owner; the page also renders it for
 * owners only. `vault` is the page's existing masked SSN / DL# panel with its
 * Reveal, placed here so an owner has one place to look.
 */
export function OnboardingFile({ userId, vault }: { userId: string; vault?: ReactNode }) {
  const [file, setFile] = useState<OnboardingFileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [openedFiles, setOpenedFiles] = useState<Record<string, UploadedFile[]>>({});
  const [filesLoadingId, setFilesLoadingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [ready, setReady] = useState<File | null>(null);
  // In-app viewer, not a new tab: a tab opened after an await is blocked or
  // opens blank in Safari and strands an iPhone home-screen app.
  const viewer = useAttachmentViewer();

  const base = `/api/portal/admin/onboarding-file/${encodeURIComponent(userId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch(base, { headers: await authHeaders(), cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(typeof json.error === 'string' ? json.error : "Couldn't load the onboarding file");
      setFile(json as OnboardingFileSummary);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the onboarding file");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFiles = async (item: OnboardingFileItem) => {
    setFilesLoadingId(item.itemId);
    setError('');
    try {
      const response = await fetch(`${base}/files?itemId=${encodeURIComponent(item.itemId)}`, {
        headers: await authHeaders(),
        cache: 'no-store',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : "Couldn't open the files");
      setOpenedFiles((prev) => ({ ...prev, [item.itemId]: Array.isArray(json.files) ? json.files : [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the files");
    } finally {
      setFilesLoadingId(null);
    }
  };

  const openSignedPdf = (item: OnboardingFileItem, opener: HTMLElement) =>
    viewer.showDocument(
      `${base}/signed-pdf?itemId=${encodeURIComponent(item.itemId)}`,
      `${item.label}, signed by ${file?.profile.name || 'this person'}`,
      authHeaders,
      opener
    );

  // Fetch first ("Preparing…"). Where the browser can share files (iPhone,
  // including the home-screen app), the iOS share sheet offers Save to Files,
  // but share() must run straight from a tap, so the zip waits behind one
  // clear "Save file" tap. Everywhere else it downloads right away.
  const downloadAll = async () => {
    setDownloading(true);
    setError('');
    setDownloaded(false);
    try {
      const response = await fetch(`${base}/download`, { headers: await authHeaders(), cache: 'no-store' });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(typeof json.error === 'string' ? json.error : 'The download failed');
      }
      const filename = FILENAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'onboarding-file.zip';
      const zip = new File([await response.blob()], filename, { type: 'application/zip' });
      if (canShareFile(zip)) {
        setReady(zip);
      } else {
        downloadBlob(filename, zip);
        setDownloaded(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The download failed');
    } finally {
      setDownloading(false);
      setConfirming(false);
    }
  };

  const saveReady = () => {
    if (!ready) return;
    const zip = ready;
    // Called synchronously from the tap, as share() requires.
    navigator.share({ files: [zip] }).then(
      () => {
        setReady(null);
        setDownloaded(true);
      },
      (err: unknown) => {
        // Closing the share sheet is not a failure; the file stays ready.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        downloadBlob(zip.name, zip);
        setReady(null);
        setDownloaded(true);
      }
    );
  };

  const profile = file?.profile;
  const cityLine = profile
    ? [profile.city, [profile.state, profile.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : '';
  const fullAddress = profile ? [profile.address, cityLine].filter(Boolean).join(', ') : '';
  const name = profile?.name || 'this person';

  return (
    <section id="onboarding-file" className={`${s.panel} ${f.section}`} aria-labelledby="onboarding-file-heading">
      <div className={`${s.panelHead} ${u.band} ${f.head}`}>
        <h2 id="onboarding-file-heading" className={s.kicker}>
          Onboarding file
        </h2>
        <span className={u.tag}>
          <Lock size={12} aria-hidden="true" />
          Owner only
        </span>
      </div>
      <p className={`${u.panelBody} ${u.hint} ${d.intro}`}>
        Everything this person gave us during onboarding: their details, each checklist step, and their private
        numbers.
      </p>

      {loading && !file ? (
        <AdminSkeletonRows rows={4} label="Loading onboarding file" />
      ) : !file || !profile ? (
        <AdminFailed what="the onboarding file" detail={loadError || undefined} onRetry={() => void load()} />
      ) : (
        <div className={`${u.panelBody} ${f.body}`}>
          {error ? (
            <AdminNotice tone="error" onDismiss={() => setError('')}>
              {error}
            </AdminNotice>
          ) : null}
          {downloaded ? (
            <AdminNotice tone="ok" onDismiss={() => setDownloaded(false)}>
              Downloaded. Delete the file when you are done with it.
            </AdminNotice>
          ) : null}

          <div className={f.group}>
            <p className={u.hint}>
              Every signed document, upload and an info sheet with full SSN and license number, in one .zip. Each
              download is logged under your name.
            </p>
            {ready ? (
              <div className={d.revealConfirm} role="status">
                <p>{ready.name} is ready. Save it to Files or send it where you need it.</p>
                <div className={u.btnRow}>
                  <button
                    type="button"
                    className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                    onClick={() => setReady(null)}
                  >
                    Cancel
                  </button>
                  <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={saveReady}>
                    <Download size={18} aria-hidden="true" />
                    Save file
                  </button>
                </div>
              </div>
            ) : confirming ? (
              <div className={d.revealConfirm} role="alertdialog" aria-labelledby="onboarding-file-confirm">
                <p id="onboarding-file-confirm">
                  Download everything on file for {name}, including full SSN and license number? This is logged under
                  your name.
                </p>
                <div className={u.btnRow}>
                  <button
                    type="button"
                    className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                    onClick={() => setConfirming(false)}
                    disabled={downloading}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className={`${s.btnPrimary} ${u.primarySm}`}
                    onClick={() => void downloadAll()}
                    disabled={downloading}
                  >
                    {downloading ? 'Preparing…' : 'Download'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={u.btnRow}>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${u.sm}`}
                  onClick={() => {
                    setDownloaded(false);
                    setConfirming(true);
                  }}
                >
                  <Download size={16} aria-hidden="true" />
                  Download all files
                </button>
              </div>
            )}
          </div>

          <div className={f.group}>
            <h3 className={f.subhead}>Profile</h3>
            <p className={u.hint}>Contact and job details from their onboarding paperwork.</p>
            <dl className={u.facts}>
              <Fact label="Phone" value={profile.phone} />
              <Fact label="Email" value={profile.email} />
              <Fact label="Address" value={fullAddress} wide />
              <Fact label="Shirt size" value={profile.shirtSize} />
              <Fact label="Role" value={profile.isIBO && profile.role ? `${profile.role} (IBO)` : profile.role} />
              <Fact label="Manager" value={profile.manager} />
              <Fact label="Status" value={profile.status.replace(/^./, (c) => c.toUpperCase())} />
              <Fact label="Hire date" value={profile.hireDate} />
              <Fact label="Packet submitted" value={profile.packetSubmittedAt} />
              <Fact label="Background consent" value={profile.backgroundConsent} />
              <Fact label="Account created" value={profile.createdAt} />
            </dl>
          </div>

          <div className={f.group}>
            <h3 className={f.subhead}>Onboarding items</h3>
            <p className={u.hint}>
              Each step of their hiring checklist and where it stands. Approved means done; Needs review means it is
              waiting on you; Rejected means it was sent back to fix; Not started or Not sent yet means nothing to check
              yet.
            </p>
            {file.items.length > 0 ? (
              <div className={u.btnRow}>
                <Link
                  href={`/portal/admin/onboarding?tab=todo&person=${encodeURIComponent(userId)}`}
                  className={`${s.btnPrimary} ${u.primarySm}`}
                >
                  <ClipboardCheck size={18} aria-hidden="true" />
                  Check documents
                </Link>
                <span className={u.hint}>Opens their checklist so you can Approve or Ask to fix each item.</span>
              </div>
            ) : null}
            {file.items.length === 0 ? (
              <AdminEmpty title="No onboarding on file">
                {name} has no onboarding checklist, usually because they joined before portal onboarding. The download
                still includes their info sheet.
              </AdminEmpty>
            ) : (
              <ul className={f.items}>
                {file.items.map((item) => {
                  const status = onboardingFileItemStatus(item);
                  const opened = openedFiles[item.itemId];
                  return (
                    <li key={item.itemId} className={f.item}>
                      <div className={f.itemTop}>
                        <span className={f.itemName}>
                          {item.label}
                          <span className={u.cellSub}>
                            {OnboardingCategoryLabels[item.category] ?? item.category}
                            {item.sensitive ? ' · Sensitive' : ''}
                          </span>
                        </span>
                        <StatusDot tone={status.tone}>{status.label}</StatusDot>
                      </div>
                      {itemMeta(item).map((line) => (
                        <p key={line} className={f.itemMeta}>
                          {line}
                        </p>
                      ))}

                      {item.hasSignedPdf || item.hasFiles ? (
                        <div className={f.actions}>
                          {item.hasSignedPdf ? (
                            <button
                              type="button"
                              className={`${s.btnSecondary} ${u.sm}`}
                              onClick={(event) => openSignedPdf(item, event.currentTarget)}
                            >
                              <FileText size={16} aria-hidden="true" />
                              View signed PDF
                            </button>
                          ) : null}
                          {item.hasFiles && !opened ? (
                            <button
                              type="button"
                              className={`${s.btnSecondary} ${u.sm}`}
                              onClick={() => void openFiles(item)}
                              disabled={filesLoadingId === item.itemId}
                            >
                              <FileText size={16} aria-hidden="true" />
                              {filesLoadingId === item.itemId ? 'Opening…' : 'View files'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {opened ? (
                        opened.length > 0 ? (
                          <>
                            <div className={o.files}>
                              {opened.map((upload) =>
                                // Photos and PDFs open in the page. A HEIC, which only
                                // Apple's browsers draw, stays a link: a real tap opens it.
                                opensInViewer(upload) ? (
                                  <button
                                    key={upload.name}
                                    type="button"
                                    className={`${o.file} ${o.fileBtn}`}
                                    onClick={(event) =>
                                      viewer.show(upload.url, `${item.label}: ${upload.name}`, event.currentTarget)
                                    }
                                  >
                                    <FileText size={16} aria-hidden="true" />
                                    <span>{upload.name}</span>
                                  </button>
                                ) : (
                                  <a
                                    key={upload.name}
                                    href={upload.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={o.file}
                                  >
                                    <FileText size={16} aria-hidden="true" />
                                    <span>{upload.name}</span>
                                  </a>
                                )
                              )}
                            </div>
                            <p className={u.hint}>Links expire in 15 minutes.</p>
                          </>
                        ) : (
                          <p className={f.itemMeta}>No files found for this item.</p>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {/* Outside the load states: the masked SSN / DL# and Reveal come from
          their own route and stay usable even if the summary fails. */}
      {vault ? (
        <div className={`${u.panelBody} ${f.group}`}>
          <h3 className={f.subhead}>Sensitive information</h3>
          {vault}
        </div>
      ) : null}
      {viewer.viewer}
    </section>
  );
}
