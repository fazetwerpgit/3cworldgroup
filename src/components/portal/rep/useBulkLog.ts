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
  /** The last send finished: the summary shows and the saved batch is gone. */
  const [finished, setFinished] = useState(false);
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
      try {
        const reply = await requestScan([path], timeout.signal);
        fields = reply?.fields ?? null;
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
        return { ...next, phase: filled ? 'read' : 'read_failed' };
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

  // Save the batch as it changes; once a send finishes it is cleared instead.
  useEffect(() => {
    if (!storageKey || restoredKey !== storageKey || finished) return;
    const timer = window.setTimeout(() => writeBulkBatch(storageKey, rows), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey, restoredKey, rows, finished]);

  /** Queue picked files; anything past BULK_MAX_FILES is left off (overCap says so). */
  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    const room = Math.max(0, BULK_MAX_FILES - rowsRef.current.length);
    setOverCap(picked.length > room);
    const taken = picked.slice(0, room);
    if (taken.length === 0) return;
    setFinished(false);
    const added = taken.map((file) => {
      const row = newBulkRow(randomHex(), file.name);
      files.current.set(row.id, file);
      return row;
    });
    const urls: Record<string, string> = {};
    added.forEach((row, i) => {
      const mime = formFileMime(taken[i]);
      if (mime.startsWith('image/') && mime !== 'image/heic' && mime !== 'image/heif') {
        const url = URL.createObjectURL(taken[i]);
        objectUrls.current.add(url);
        urls[row.id] = url;
      }
    });
    setPreviews((prev) => ({ ...prev, ...urls }));
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
    setFinished(false);
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const setInclude = (id: string, include: boolean) => {
    setFinished(false);
    patch(id, { include });
  };

  /** The edit sheet's values. An edit clears a "Not sent" reason, never a logged result. */
  const save = (id: string, change: Pick<BulkRow, 'formData' | 'products' | 'provider' | 'saleDateTouched' | 'flags'>) => {
    setFinished(false);
    patch(id, (row) => {
      const stale = row.result?.kind === 'failed' || (row.result?.kind === 'already' && orderChanged(row, change));
      return { ...row, ...change, result: stale ? null : row.result };
    });
  };

  /** Throw the whole batch away. */
  const startOver = () => {
    for (const controller of controllers.current.values()) controller.abort();
    queue.current = [];
    files.current.clear();
    setRows([]);
    rowsRef.current = [];
    setLost(0);
    setOverCap(false);
    setFromSaved(false);
    setFinished(false);
    setUploadErrors({});
    if (storageKey) writeBulkBatch(storageKey, null);
  };

  const sendingRef = useRef(false);
  /** `wholeBatch`: "Log N sales", which ends the batch (summary, saved copy cleared). */
  const send = async (targets: BulkRow[], { allowDuplicate, wholeBatch }: { allowDuplicate: boolean; wholeBatch: boolean }) => {
    if (!user || sendingRef.current || targets.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    if (wholeBatch) setFinished(false);
    try {
      await submitBulkRows({
        rows: targets,
        user,
        create: createSale,
        allowDuplicate,
        onStart: (id) => patch(id, { sending: true }),
        onResult: (id, result: BulkResult) => {
          patch(id, { sending: false, result });
          // Keep the saved copy current between sends, so a close mid-batch
          // never forgets which ones are already logged.
          if (storageKey && alive.current) {
            writeBulkBatch(
              storageKey,
              rowsRef.current.map((row) => (row.id === id ? { ...row, sending: false, result } : row))
            );
          }
        },
        shouldStop: () => !alive.current,
      });
    } finally {
      sendingRef.current = false;
      if (alive.current) {
        setSending(false);
        if (wholeBatch || finished) {
          setFinished(true);
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

/** A new order number is a new question for the server: drop its old "already logged". */
function orderChanged(row: BulkRow, change: Pick<BulkRow, 'formData'>): boolean {
  return row.formData.orderNumberOrBtn.trim() !== change.formData.orderNumberOrBtn.trim();
}

export type BulkLog = ReturnType<typeof useBulkLog>;
