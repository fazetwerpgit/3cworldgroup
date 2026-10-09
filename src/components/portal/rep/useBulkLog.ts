'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import { formFileMime, prepareFormFile } from '@/lib/forms/uploadFormAttachment';
import { randomHex } from '@/lib/randomHex';
import {
  BULK_CONCURRENCY,
  BULK_KEY_PREFIX,
  BULK_MAX_FILES,
  applyScanToRow,
  batchSettled,
  batchSummary,
  findRepeats,
  hashBytes,
  newBulkRow,
  readBulkBatch,
  sendableRows,
  writeBulkBatch,
  type BulkResult,
  type BulkRow,
} from '@/lib/sales/bulk/batch';
import { submitBulkRows } from '@/lib/sales/bulk/submit';
import { markScanIntroUsed } from '@/lib/sales/scan/intro';
import { proofUploadMessage, uploadProofFile } from './ProofCapture';
import { requestScan } from './useSaleScan';

// The bulk uploader's state: the batch rows, the upload-and-read queue (three
// at a time), the saved copy in localStorage, and sending. The rules live in
// lib/sales/bulk; this wires them to the upload, the reader and createSale.

const SCAN_TIMEOUT_MS = 30_000;
const SAVE_DELAY_MS = 300;

type Task = { id: string; kind: 'full' | 'read' };

export function useBulkLog() {
  const { user } = useAuth();
  const { createSale } = useSales();
  const storageKey = user ? `${BULK_KEY_PREFIX}${user.uid}` : null;

  const [rows, setRows] = useState<BulkRow[]>([]);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  /** The batch came back from storage (shows "Picking up where you left off"). */
  const [fromSaved, setFromSaved] = useState(false);
  /** Screenshots from the saved batch that never got uploaded: pick them again. */
  const [lost, setLost] = useState(0);
  const [overCap, setOverCap] = useState(false);
  const [sending, setSending] = useState(false);
  /** The last "Log N sales" finished: the summary shows. */
  const [finished, setFinished] = useState(false);
  /** Every ticked row is settled and the saved copy is gone; nothing more is saved until a change. */
  const [cleared, setCleared] = useState(false);
  /** Upload errors by row, for the card (in memory only). */
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });
  const files = useRef(new Map<string, File>());
  const queue = useRef<Task[]>([]);
  const active = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  const alive = useRef(true);
  // Bumped by Start over: a send in progress stops before its next sale and
  // its answers no longer touch the (new) batch.
  const generation = useRef(0);

  // Restore once the user is known, during render, so the first paint shows it.
  if (storageKey && restoredKey !== storageKey) {
    setRestoredKey(storageKey);
    const saved = readBulkBatch(storageKey);
    if (saved) {
      setRows(saved.rows);
      setLost(saved.lost);
      setFromSaved(saved.rows.length > 0);
    }
  }

  const patch = useCallback((id: string, change: Partial<BulkRow> | ((row: BulkRow) => BulkRow)) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? (typeof change === 'function' ? change(row) : { ...row, ...change }) : row))
    );
  }, []);

  const readRow = useCallback(
    async (id: string, path: string, signal: AbortSignal) => {
      patch(id, { phase: 'reading' });
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), SCAN_TIMEOUT_MS);
      const onAbort = () => timeout.abort();
      signal.addEventListener('abort', onAbort);
      let fields = null;
      let busy = false;
      try {
        const reply = await requestScan([path], timeout.signal);
        fields = reply?.fields ?? null;
        busy = reply?.reason === 'rate_limited';
      } catch {
        fields = null;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
      if (signal.aborted) return;
      if (fields) markScanIntroUsed();
      patch(id, (row) => {
        const { row: next, filled } = applyScanToRow(row, fields);
        return { ...next, phase: filled ? 'read' : 'read_failed', readBusy: busy };
      });
    },
    [patch]
  );

  const runTask = useCallback(
    async (task: Task) => {
      const controller = new AbortController();
      controllers.current.set(task.id, controller);
      try {
        if (task.kind === 'read') {
          const path = rowsRef.current.find((row) => row.id === task.id)?.proofPath;
          if (path) await readRow(task.id, path, controller.signal);
          return;
        }
        const file = files.current.get(task.id);
        if (!file) return;
        patch(task.id, { phase: 'uploading' });
        void makeThumb(file).then((url) => {
          if (!url) return;
          if (!alive.current || !rowsRef.current.some((row) => row.id === task.id)) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrls.current.add(url);
          setPreviews((prev) => ({ ...prev, [task.id]: url }));
        });
        // The picture's fingerprint, for "Same screenshot as #2".
        try {
          const hash = await hashBytes(await file.arrayBuffer());
          patch(task.id, { hash });
        } catch {
          // No fingerprint: the order number still catches a repeat.
        }
        let path: string;
        try {
          const prepared = await prepareFormFile(file);
          path = await uploadProofFile(prepared, task.id, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          setUploadErrors((prev) => ({ ...prev, [task.id]: proofUploadMessage(error) }));
          patch(task.id, { phase: 'upload_failed' });
          return;
        }
        if (controller.signal.aborted) return;
        files.current.delete(task.id);
        patch(task.id, { proofPath: path });
        await readRow(task.id, path, controller.signal);
      } finally {
        if (controllers.current.get(task.id) === controller) controllers.current.delete(task.id);
      }
    },
    [patch, readRow]
  );

  const pump = useCallback(() => {
    while (alive.current && active.current < BULK_CONCURRENCY && queue.current.length > 0) {
      const task = queue.current.shift() as Task;
      active.current += 1;
      void runTask(task).finally(() => {
        active.current -= 1;
        pump();
      });
    }
  }, [runTask]);

  const enqueue = useCallback(
    (tasks: Task[]) => {
      queue.current.push(...tasks);
      pump();
    },
    [pump]
  );

  // Running while mounted. A saved batch that was being read when the page
  // closed has its screenshots read again.
  useEffect(() => {
    alive.current = true;
    const running = controllers.current;
    if (restoredKey) {
      const reading = rowsRef.current.filter((row) => row.phase === 'reading' && row.proofPath);
      if (reading.length > 0) enqueue(reading.map((row) => ({ id: row.id, kind: 'read' })));
    }
    return () => {
      alive.current = false;
      queue.current = [];
      for (const controller of running.values()) controller.abort();
    };
  }, [restoredKey, enqueue]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  // Save the batch as it changes, until it is settled and cleared.
  useEffect(() => {
    if (!storageKey || restoredKey !== storageKey || cleared) return;
    const timer = window.setTimeout(() => writeBulkBatch(storageKey, rows), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey, restoredKey, rows, cleared]);

  /** A change after the batch was settled: it is worth saving again. */
  const changed = () => {
    setFinished(false);
    setCleared(false);
  };

  const dropPreview = (id: string) => {
    setPreviews((prev) => {
      const url = prev[id];
      if (!url) return prev;
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** Queue picked files; anything past BULK_MAX_FILES is left off (overCap says so). */
  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    const room = Math.max(0, BULK_MAX_FILES - rowsRef.current.length);
    setOverCap(picked.length > room);
    const taken = picked.slice(0, room);
    if (taken.length === 0) return;
    changed();
    const added = taken.map((file) => {
      const row = newBulkRow(randomHex(), file.name);
      files.current.set(row.id, file);
      return row;
    });
    setRows((prev) => [...prev, ...added]);
    rowsRef.current = [...rowsRef.current, ...added];
    enqueue(added.map((row) => ({ id: row.id, kind: 'full' })));
  };

  /** Try a failed upload again (only while the picked file is still in memory). */
  const retryUpload = (id: string) => {
    if (!files.current.has(id)) return;
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    patch(id, { phase: 'uploading' });
    enqueue([{ id, kind: 'full' }]);
  };

  /** Read a screenshot the reader could not make out again. */
  const readAgain = (id: string) => {
    patch(id, { phase: 'reading' });
    enqueue([{ id, kind: 'read' }]);
  };

  const remove = (id: string) => {
    controllers.current.get(id)?.abort();
    queue.current = queue.current.filter((task) => task.id !== id);
    files.current.delete(id);
    dropPreview(id);
    changed();
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const setInclude = (id: string, include: boolean) => {
    changed();
    patch(id, { include });
  };

  /** The edit sheet's values. An edit clears a "Not sent" reason, never a logged result. */
  const save = (id: string, change: Pick<BulkRow, 'formData' | 'products' | 'provider' | 'saleDateTouched' | 'flags'>) => {
    changed();
    patch(id, (row) => {
      const stale = row.result?.kind === 'failed' || (row.result?.kind === 'already' && orderChanged(row, change));
      return { ...row, ...change, result: stale ? null : row.result };
    });
  };

  /** Throw the whole batch away (the page offers it only while nothing is sending). */
  const startOver = () => {
    generation.current += 1;
    for (const controller of controllers.current.values()) controller.abort();
    queue.current = [];
    files.current.clear();
    setRows([]);
    rowsRef.current = [];
    setLost(0);
    setOverCap(false);
    setFromSaved(false);
    setFinished(false);
    setCleared(false);
    setUploadErrors({});
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setPreviews({});
    if (storageKey) writeBulkBatch(storageKey, null);
  };

  const sendingRef = useRef(false);
  /**
   * Send rows one at a time. `wholeBatch` ("Log N sales") shows the summary
   * after. The saved copy is cleared only once every ticked row is settled;
   * otherwise it stays, so the rep can close the app and retry the rest.
   */
  const send = async (targets: BulkRow[], { allowDuplicate, wholeBatch }: { allowDuplicate: boolean; wholeBatch: boolean }) => {
    if (!user || sendingRef.current || targets.length === 0) return;
    const run = generation.current;
    const current = () => alive.current && generation.current === run;
    sendingRef.current = true;
    setSending(true);
    setCleared(false);
    if (wholeBatch) setFinished(false);
    // This send's answers, laid over the rows as they were, for saving.
    const results = new Map<string, BulkResult>();
    const withResults = () =>
      rowsRef.current.map((row) => {
        const result = results.get(row.id);
        return result ? { ...row, sending: false, result } : row;
      });
    try {
      await submitBulkRows({
        rows: targets,
        user,
        create: createSale,
        allowDuplicate,
        onStart: (id) => {
          if (current()) patch(id, { sending: true });
        },
        onResult: (id, result: BulkResult) => {
          // After Start over this batch is gone; after closing the page the
          // answer is still saved, so the rep sees it when they come back.
          if (generation.current !== run) return;
          results.set(id, result);
          if (alive.current) patch(id, { sending: false, result });
          // Keep the saved copy current between sends, so a close mid-batch
          // never forgets which ones are already logged.
          if (storageKey) writeBulkBatch(storageKey, withResults());
        },
        shouldStop: () => !current(),
      });
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
      if (generation.current === run) {
        if (alive.current && (wholeBatch || finished)) setFinished(true);
        if (batchSettled(withResults())) {
          if (alive.current) setCleared(true);
          if (storageKey) writeBulkBatch(storageKey, null);
        }
      }
    }
  };

  /** "Log N sales": every ticked row that is ready, one at a time. */
  const logAll = () => send(sendableRows(rowsRef.current), { allowDuplicate: false, wholeBatch: true });

  /** "Log anyway": this row's order number is on another sale and the rep says it is separate. */
  const logAnyway = (id: string) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (row) void send([row], { allowDuplicate: true, wholeBatch: false });
  };

  const repeats = useMemo(() => findRepeats(rows), [rows]);
  const toSend = useMemo(() => sendableRows(rows).length, [rows]);
  const summary = useMemo(() => batchSummary(rows), [rows]);
  const busy = rows.some((row) => row.phase === 'uploading' || row.phase === 'reading');

  return {
    rows,
    repeats,
    previews,
    uploadErrors,
    toSend,
    summary,
    busy,
    sending,
    finished,
    fromSaved,
    lost,
    overCap,
    room: BULK_MAX_FILES - rows.length,
    addFiles,
    retryUpload,
    readAgain,
    remove,
    setInclude,
    save,
    startOver,
    logAll,
    logAnyway,
  };
}

/**
 * A small thumbnail for the card: the screenshot drawn once onto an 88px-wide
 * canvas, so 25 full-size phone screenshots are never kept decoded for the
 * list. Falls back to the file itself where the browser cannot (HEIC, old
 * browsers), and to nothing for a file that is not a picture.
 */
async function makeThumb(file: File): Promise<string | null> {
  const mime = formFileMime(file);
  if (!mime.startsWith('image/')) return null;
  if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file);
      const width = 88;
      const height = Math.min(176, Math.max(1, Math.round((bitmap.height / bitmap.width) * width)));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      // Top of the screenshot: where the order details start.
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, Math.round((bitmap.height / bitmap.width) * width));
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
      if (blob) return URL.createObjectURL(blob);
    } catch {
      // Fall through to the file itself.
    }
  }
  if (mime === 'image/heic' || mime === 'image/heif') return null;
  return URL.createObjectURL(file);
}

/** A new order number is a new question for the server: drop its old "already logged". */
function orderChanged(row: BulkRow, change: Pick<BulkRow, 'formData'>): boolean {
  return row.formData.orderNumberOrBtn.trim() !== change.formData.orderNumberOrBtn.trim();
}

export type BulkLog = ReturnType<typeof useBulkLog>;
