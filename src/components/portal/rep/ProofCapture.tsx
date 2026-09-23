'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, ImageIcon, ImagePlus, Loader2, RotateCcw, X } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { openAttachmentInNewTab } from '@/lib/forms/openAttachment';
import {
  checkFormFile,
  formFileMime,
  FormUploadError,
  isUploadCancelled,
  prepareFormFile,
  uploadFormAttachment,
} from '@/lib/forms/uploadFormAttachment';
import { MAX_PROOF_SCREENSHOTS, newProofSlot } from '@/lib/sales/proofPaths';
import { randomHex } from '@/lib/randomHex';
import s from './rep.module.css';
import l from './rep-logsale.module.css';

// Up to MAX_PROOF_SCREENSHOTS proof screenshots for one sale. Each file gets its
// own upload slot (the upload route clears a slot's folder before writing, so a
// shared slot would keep only the last file); the stored path is the folder.

export const PROOF_ACCEPT = 'image/*,application/pdf';

type Preview = { url: string | null; isPdf: boolean };

export type ProofTile =
  | { kind: 'done'; key: string; path: string; preview: Preview | null }
  | { kind: 'uploading'; key: string; preview: Preview | null }
  | { kind: 'failed'; key: string; preview: Preview | null; error: string };

type Pending = {
  key: string;
  file: File;
  preview: Preview | null;
  status: 'uploading' | 'failed';
  error?: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function signedProofUrl(path: string): Promise<string | null> {
  const response = await fetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`, {
    headers: await authHeaders(),
  });
  const data = (await response.json().catch(() => null)) as { url?: string | null } | null;
  return response.ok ? data?.url ?? null : null;
}

/**
 * What the tile says when an upload fails: our own wording (a wrong type, too
 * big, timed out) as is, anything else (a browser's "Load failed", a server
 * string) as a plain "Upload failed", since the tile offers Retry anyway.
 */
export function proofUploadMessage(error: unknown): string {
  return error instanceof FormUploadError ? error.message : 'Upload failed';
}

function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Upload queue for the sale's proof screenshots. `paths` (owned by the form, so
 * it lands in the draft) holds the finished uploads; this hook adds the ones in
 * flight or failed, plus thumbnails.
 */
export function useProofUploads({
  paths,
  onAdd,
  onRemove,
  slotKey,
}: {
  paths: string[];
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  slotKey: string;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  // The last pick went over the cap, so some files were left off.
  const [overCap, setOverCap] = useState(false);
  const objectUrls = useRef<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  // One controller per upload in flight, so the rep can cancel a stalled one.
  const controllers = useRef<Map<string, AbortController>>(new Map());
  // Each tile's file as sent: read and shrunk once, reused by Retry. Android can
  // let go of a picked file after a while, so a retry that read it again would
  // fail with "could not be read" however good the signal had become.
  const preparedFiles = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    const urls = objectUrls.current;
    const running = controllers.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  // A draft restored after a reload has paths but no local files: fetch a
  // signed URL per screenshot so the rep still sees what is attached.
  useEffect(() => {
    for (const path of paths) {
      if (previews[path] || requested.current.has(path)) continue;
      requested.current.add(path);
      signedProofUrl(path)
        .then((url) => {
          if (url) setPreviews((prev) => ({ ...prev, [path]: { url, isPdf: isPdfUrl(url) } }));
        })
        .catch(() => {
          // Thumbnail only; the tile falls back to an icon.
        });
    }
  }, [paths, previews]);

  const upload = useCallback(
    async (item: Pending) => {
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      try {
        let file = preparedFiles.current.get(item.key);
        if (!file) {
          file = await prepareFormFile(item.file);
          preparedFiles.current.set(item.key, file);
        }
        const path = await uploadFormAttachment({
          file,
          prepared: true,
          itemId: 'sale-proof',
          formType: 'sale-proof',
          slot: newProofSlot(slotKey),
          getHeaders: authHeaders,
          signal: controller.signal,
        });
        if (item.preview) setPreviews((prev) => ({ ...prev, [path]: item.preview as Preview }));
        requested.current.add(path);
        preparedFiles.current.delete(item.key);
        setPending((prev) => prev.filter((p) => p.key !== item.key));
        onAdd(path);
      } catch (error) {
        // Cancelled by the rep: the tile is already gone.
        if (isUploadCancelled(error) || controller.signal.aborted) return;
        const message = proofUploadMessage(error);
        setPending((prev) =>
          prev.map((p) => (p.key === item.key ? { ...p, status: 'failed', error: message } : p))
        );
      } finally {
        if (controllers.current.get(item.key) === controller) controllers.current.delete(item.key);
      }
    },
    [onAdd, slotKey]
  );

  const room = MAX_PROOF_SCREENSHOTS - paths.length - pending.length;

  /**
   * Queue picked files; returns how many were taken. Files beyond the cap are
   * left off, and `overCap` tells the rep so instead of dropping them silently.
   */
  const addFiles = (files: File[]): number => {
    if (files.length > 0) setOverCap(files.length > Math.max(0, room));
    const taken = files.slice(0, Math.max(0, room)).map<Pending>((file) => {
      const typeError = checkFormFile(file);
      let preview: Preview | null = null;
      const mime = formFileMime(file);
      if (mime === 'application/pdf') preview = { url: null, isPdf: true };
      else if (mime.startsWith('image/') && mime !== 'image/heic' && mime !== 'image/heif') {
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        preview = { url, isPdf: false };
      }
      return {
        key: randomHex(),
        file,
        preview,
        status: typeError ? 'failed' : 'uploading',
        error: typeError ?? undefined,
      };
    });
    if (taken.length === 0) return 0;
    setPending((prev) => [...prev, ...taken]);
    for (const item of taken) if (item.status === 'uploading') void upload(item);
    return taken.length;
  };

  const retry = (key: string) => {
    const item = pending.find((p) => p.key === key);
    if (!item) return;
    const next: Pending = { ...item, status: 'uploading', error: undefined };
    setPending((prev) => prev.map((p) => (p.key === key ? next : p)));
    void upload(next);
  };

  /** Drop a failed tile, or cancel one still uploading (aborts its request). */
  const discard = (key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    preparedFiles.current.delete(key);
    setOverCap(false);
    setPending((prev) => prev.filter((p) => p.key !== key));
  };

  const remove = (path: string) => {
    setOverCap(false);
    onRemove(path);
  };

  const tiles: ProofTile[] = [
    ...paths.map<ProofTile>((path) => ({ kind: 'done', key: path, path, preview: previews[path] ?? null })),
    ...pending.map<ProofTile>((p) =>
      p.status === 'failed'
        ? { kind: 'failed', key: p.key, preview: p.preview, error: p.error ?? 'Upload failed' }
        : { kind: 'uploading', key: p.key, preview: p.preview }
    ),
  ];

  return {
    tiles,
    addFiles,
    retry,
    discard,
    remove,
    room,
    overCap,
    uploadingCount: pending.filter((p) => p.status === 'uploading').length,
  };
}

export type ProofUploads = ReturnType<typeof useProofUploads>;

function Thumb({ preview, label }: { preview: Preview | null; label: string }) {
  if (preview?.url && !preview.isPdf) {
    // eslint-disable-next-line @next/next/no-img-element -- blob: and signed URLs
    return <img src={preview.url} alt={label} className={l.thumbImg} />;
  }
  return (
    <span className={l.thumbIcon} aria-label={label} role="img">
      {preview?.isPdf ? <FileText size={22} aria-hidden="true" /> : <ImageIcon size={22} aria-hidden="true" />}
    </span>
  );
}

/** Thumbnails with remove buttons plus an add tile until the cap is reached. */
export function ProofCapture({ uploads, orderRequired }: { uploads: ProofUploads; orderRequired: boolean }) {
  const { tiles, room } = uploads;
  const count = tiles.filter((t) => t.kind === 'done').length;

  const view = (tile: ProofTile & { kind: 'done' }) => {
    // Called straight from the click so iOS Safari allows the new tab.
    const local = tile.preview?.url && tile.preview.url.startsWith('blob:') ? tile.preview.url : null;
    void openAttachmentInNewTab(async () => local ?? (await signedProofUrl(tile.path)));
  };

  return (
    <section className={l.proofCard} aria-labelledby="proof-h">
      <div className={l.proofMeta}>
        <h2 id="proof-h" className={s.kicker}>
          {count > 0 ? 'Proof attached' : 'Proof'}
        </h2>
        <p className={l.proofName} aria-live="polite">
          {count > 0
            ? `${count} screenshot${count === 1 ? '' : 's'} attached`
            : orderRequired
              ? 'No screenshot, order number needed'
              : 'No screenshot yet'}
        </p>
      </div>
      <ul className={l.thumbs}>
        {tiles.map((tile, index) => {
          const label = `Screenshot ${index + 1}`;
          return (
            <li key={tile.key} className={`${l.thumb} ${tile.kind === 'failed' ? l.thumbFailed : ''}`}>
              {tile.kind === 'done' ? (
                <button type="button" className={l.thumbView} onClick={() => view(tile)} aria-label={`View ${label.toLowerCase()}`}>
                  <Thumb preview={tile.preview} label={label} />
                </button>
              ) : (
                <span className={l.thumbView}>
                  <Thumb preview={tile.preview} label={label} />
                  {tile.kind === 'uploading' ? (
                    <span className={l.thumbState} role="status">
                      <Loader2 size={20} className={l.spin} aria-hidden="true" />
                      <span className={s.srOnly}>Uploading {label.toLowerCase()}</span>
                    </span>
                  ) : (
                    <span className={l.thumbState}>
                      <AlertTriangle size={18} aria-hidden="true" />
                      <button
                        type="button"
                        className={l.thumbRetry}
                        onClick={() => uploads.retry(tile.key)}
                        aria-label={`Retry ${label.toLowerCase()}`}
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                        Retry
                      </button>
                    </span>
                  )}
                </span>
              )}
              <button
                type="button"
                className={l.thumbRemove}
                aria-label={
                  tile.kind === 'uploading' ? `Cancel upload of ${label.toLowerCase()}` : `Remove ${label.toLowerCase()}`
                }
                onClick={() => (tile.kind === 'done' ? uploads.remove(tile.path) : uploads.discard(tile.key))}
              >
                <X size={14} strokeWidth={2.75} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {room > 0 ? (
          <li className={l.thumb}>
            <label className={l.thumbAdd}>
              <input
                type="file"
                accept={PROOF_ACCEPT}
                multiple
                className={s.srOnly}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  // Clear so picking the same file again still fires.
                  e.target.value = '';
                  uploads.addFiles(files);
                }}
              />
              <ImagePlus size={20} aria-hidden="true" />
              {tiles.length > 0 ? 'Add another' : 'Add screenshot'}
            </label>
          </li>
        ) : null}
      </ul>
      {tiles.map((tile, index) =>
        tile.kind === 'failed' ? (
          <p key={tile.key} className={l.proofError} role="alert">
            Screenshot {index + 1}: {tile.error}
          </p>
        ) : null
      )}
      {uploads.overCap ? (
        <p className={l.proofError} role="status">
          Only {MAX_PROOF_SCREENSHOTS} screenshots per sale. The extra ones were left off.
        </p>
      ) : null}
      <p className={l.proofCap}>Up to {MAX_PROOF_SCREENSHOTS} screenshots</p>
    </section>
  );
}
