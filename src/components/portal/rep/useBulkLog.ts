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
  batchSettled,
  batchSummary,
  findRepeats,
  hashBytes,
  newBulkRow,
  newBulkShot,
  readBulkBatch,
  sendableRows,
  writeBulkBatch,
  type BulkResult,
  type BulkRow,
  type BulkSaleFields,
  type BulkShot,
} from '@/lib/sales/bulk/batch';
import { combineWithAbove, regroup, removeShot as dropShot, splitShot as splitOff } from '@/lib/sales/bulk/group';
import { submitBulkRows } from '@/lib/sales/bulk/submit';
import { markScanIntroUsed } from '@/lib/sales/scan/intro';
import { proofUploadMessage, uploadProofFile } from './ProofCapture';
import { requestScan } from './useSaleScan';

// The bulk uploader's state: the batch's sales and their screenshots, the
// upload-and-read queue (three screenshots at a time), the saved copy in
// localStorage, and sending. Every change to the screenshots runs the grouping
// again (lib/sales/bulk/group), so a sale's second screenshot joins it as soon
// as it is read. The rules live in lib/sales/bulk; this wires them to the
// upload, the reader and createSale.

const SCAN_TIMEOUT_MS = 30_000;
const SAVE_DELAY_MS = 300;

type Task = { id: string; kind: 'full' | 'read' };

const newId = () => randomHex();
const shotCount = (rows: BulkRow[]) => rows.reduce((sum, row) => sum + row.shots.length, 0);
const mapShot = (rows: BulkRow[], shotId: string, change: (shot: BulkShot) => BulkShot) =>
  rows.map((row) =>
    row.shots.some((shot) => shot.id === shotId)
      ? { ...row, shots: row.shots.map((shot) => (shot.id === shotId ? change(shot) : shot)) }
      : row
  );

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
  /** Every ticked sale is settled and the saved copy is gone; nothing more is saved until a change. */
  const [cleared, setCleared] = useState(false);
  /** Upload errors by screenshot, for the card (in memory only). */
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  /** Thumbnails by screenshot. */
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
      setRows(regroup(saved.rows, newId));
      setLost(saved.lost);
      setFromSaved(saved.rows.length > 0);
    }
  }

  /** Change the batch, then put its screenshots together again. */
  const update = useCallback((change: (rows: BulkRow[]) => BulkRow[]) => {
    setRows((prev) => regroup(change(prev), newId));
  }, []);

  const patchShot = useCallback(
    (shotId: string, change: Partial<BulkShot> | ((shot: BulkShot) => BulkShot)) =>
      update((prev) => mapShot(prev, shotId, (shot) => (typeof change === 'function' ? change(shot) : { ...shot, ...change }))),
    [update]
  );

  const patchRow = useCallback(
    (id: string, change: Partial<BulkRow>) => update((prev) => prev.map((row) => (row.id === id ? { ...row, ...change } : row))),
    [update]
  );

  const findShot = (shotId: string) =>
    rowsRef.current.flatMap((row) => row.shots).find((shot) => shot.id === shotId);

  const readShot = useCallback(
    async (shotId: string, path: string, signal: AbortSignal) => {
      patchShot(shotId, { phase: 'reading' });
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
      const read = fields && Object.keys(fields).length > 0 ? fields : null;
      if (read) markScanIntroUsed();
      patchShot(shotId, (shot) => ({
        ...shot,
        scan: read,
        phase: read ? 'read' : 'read_failed',
        readBusy: busy,
        merged: false,
        checked: false,
      }));
    },
    [patchShot]
  );

  const runTask = useCallback(
    async (task: Task) => {
      const controller = new AbortController();
      controllers.current.set(task.id, controller);
      try {
        if (task.kind === 'read') {
          const path = rowsRef.current.flatMap((row) => row.shots).find((shot) => shot.id === task.id)?.proofPath;
          if (path) await readShot(task.id, path, controller.signal);
          return;
        }
        const file = files.current.get(task.id);
        if (!file) return;
        patchShot(task.id, { phase: 'uploading' });
        void makeThumb(file).then((url) => {
          if (!url) return;
          const present = rowsRef.current.some((row) => row.shots.some((shot) => shot.id === task.id));
          if (!alive.current || !present) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrls.current.add(url);
          setPreviews((prev) => ({ ...prev, [task.id]: url }));
        });
        // The picture's fingerprint, for "Same screenshot as sale 2".
        try {
          const hash = await hashBytes(await file.arrayBuffer());
          patchShot(task.id, { hash });
        } catch {
          // No fingerprint: a copy just reads the same as the first one.
        }
        let path: string;
        try {
          const prepared = await prepareFormFile(file);
          // Each screenshot has its own upload slot, so it can move between sales.
          path = await uploadProofFile(prepared, task.id, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          setUploadErrors((prev) => ({ ...prev, [task.id]: proofUploadMessage(error) }));
          patchShot(task.id, { phase: 'upload_failed' });
          return;
        }
        if (controller.signal.aborted) return;
        files.current.delete(task.id);
        patchShot(task.id, { proofPath: path });
        await readShot(task.id, path, controller.signal);
      } finally {
        if (controllers.current.get(task.id) === controller) controllers.current.delete(task.id);
      }
    },
    [patchShot, readShot]
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

  // Running while mounted. Screenshots of a saved batch that were being read
  // when the page closed are read again.
  useEffect(() => {
    alive.current = true;
    const running = controllers.current;
    if (restoredKey) {
      const reading = rowsRef.current.flatMap((row) => row.shots).filter((shot) => shot.phase === 'reading' && shot.proofPath);
      if (reading.length > 0) enqueue(reading.map((shot) => ({ id: shot.id, kind: 'read' })));
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

  /** Stop and forget one screenshot's upload, read and thumbnail. */
  const forgetShot = (shotId: string) => {
    controllers.current.get(shotId)?.abort();
    queue.current = queue.current.filter((task) => task.id !== shotId);
    files.current.delete(shotId);
    setPreviews((prev) => {
      const url = prev[shotId];
      if (!url) return prev;
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
      const next = { ...prev };
      delete next[shotId];
      return next;
    });
  };

  /** Queue picked files; anything past BULK_MAX_FILES is left off (overCap says so). */
  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    const current = rowsRef.current;
    const room = Math.max(0, BULK_MAX_FILES - shotCount(current));
    setOverCap(picked.length > room);
    const taken = picked.slice(0, room);
    if (taken.length === 0) return;
    changed();
    let seq = current.reduce((max, row) => Math.max(max, ...row.shots.map((shot) => shot.seq + 1)), 0);
    const added = taken.map((file) => {
      const shot = newBulkShot(randomHex(), file.name, seq++);
      files.current.set(shot.id, file);
      return newBulkRow(randomHex(), shot);
    });
    update((prev) => [...prev, ...added]);
    rowsRef.current = [...current, ...added];
    enqueue(added.map((row) => ({ id: row.shots[0].id, kind: 'full' })));
  };

  const shotsOf = (id: string) => rowsRef.current.find((row) => row.id === id)?.shots ?? [];

  /** Try a sale's failed uploads again (only while the picked files are still in memory). */
  const retryUpload = (id: string) => {
    const failed = shotsOf(id).filter((shot) => shot.phase === 'upload_failed' && files.current.has(shot.id));
    if (failed.length === 0) return;
    setUploadErrors((prev) => {
      const next = { ...prev };
      for (const shot of failed) delete next[shot.id];
      return next;
    });
    for (const shot of failed) patchShot(shot.id, { phase: 'uploading' });
    enqueue(failed.map((shot) => ({ id: shot.id, kind: 'full' })));
  };

  /** Read a sale's screenshots the reader could not make out again. */
  const readAgain = (id: string) => {
    const failed = shotsOf(id).filter((shot) => shot.phase === 'read_failed' && shot.proofPath);
    for (const shot of failed) patchShot(shot.id, { phase: 'reading' });
    enqueue(failed.map((shot) => ({ id: shot.id, kind: 'read' })));
  };

  /** Remove a whole sale and its screenshots. */
  const remove = (id: string) => {
    for (const shot of shotsOf(id)) forgetShot(shot.id);
    changed();
    update((prev) => prev.filter((row) => row.id !== id));
  };

  /** Remove one screenshot from its sale. */
  const removeShot = (shotId: string) => {
    if (!findShot(shotId)) return;
    forgetShot(shotId);
    changed();
    update((prev) => dropShot(prev, shotId));
  };

  /** "Make its own sale": the screenshot leaves its sale for a new one. */
  const splitShot = (shotId: string) => {
    changed();
    update((prev) => splitOff(prev, shotId, newId));
  };

  /** "Combine with sale above". */
  const combine = (id: string) => {
    changed();
    update((prev) => combineWithAbove(prev, id));
  };

  const setInclude = (id: string, include: boolean) => {
    changed();
    patchRow(id, { include });
  };

  /**
   * The edit sheet's values. The sale is the rep's from now on (grouping no
   * longer reshapes it). An edit clears a "Not sent" reason, never a logged result.
   */
  const save = (id: string, change: BulkSaleFields) => {
    changed();
    update((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const stale = row.result?.kind === 'failed' || (row.result?.kind === 'already' && orderChanged(row, change));
        return {
          ...row,
          ...change,
          shots: row.shots.map((shot) => ({ ...shot, merged: true, checked: true })),
          fixed: true,
          result: stale ? null : row.result,
        };
      })
    );
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
   * Send sales one at a time. `wholeBatch` ("Log N sales") shows the summary
   * after. The saved copy is cleared only once every ticked sale is settled;
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
    // This send's answers, laid over the sales as they were, for saving.
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
          if (current()) patchRow(id, { sending: true });
        },
        onResult: (id, result: BulkResult) => {
          // After Start over this batch is gone; after closing the page the
          // answer is still saved, so the rep sees it when they come back.
          if (generation.current !== run) return;
          results.set(id, result);
          if (alive.current) patchRow(id, { sending: false, result });
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

  /** "Log N sales": every ticked sale that is ready, one at a time. */
  const logAll = () => send(sendableRows(rowsRef.current), { allowDuplicate: false, wholeBatch: true });

  /** "Log anyway": this sale's order number is on another sale and the rep says it is separate. */
  const logAnyway = (id: string) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (row) void send([row], { allowDuplicate: true, wholeBatch: false });
  };

  const repeats = useMemo(() => findRepeats(rows), [rows]);
  const toSend = useMemo(() => sendableRows(rows).length, [rows]);
  const summary = useMemo(() => batchSummary(rows), [rows]);
  const shots = shotCount(rows);
  const working = rows.reduce(
    (sum, row) => sum + row.shots.filter((shot) => shot.phase === 'uploading' || shot.phase === 'reading').length,
    0
  );

  return {
    rows,
    repeats,
    previews,
    uploadErrors,
    toSend,
    summary,
    busy: working > 0,
    /** Screenshots still uploading or being read. */
    working,
    shots,
    sending,
    finished,
    fromSaved,
    lost,
    overCap,
    room: BULK_MAX_FILES - shots,
    addFiles,
    retryUpload,
    readAgain,
    remove,
    removeShot,
    splitShot,
    combine,
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
