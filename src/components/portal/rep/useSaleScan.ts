'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { markScanIntroUsed } from '@/lib/sales/scan/intro';
import type { SaleScanFields, SaleScanResponse, ScanConfidence, ScanValue } from '@/lib/sales/scan/types';

// The Log Sale screenshot reader, client side. When a proof screenshot finishes
// uploading and the form is still blank, ask /api/portal/sales/scan to read it
// and prefill what it found. The rep's own typing always wins: a field they
// typed in (even one they then cleared) is never filled, and nothing is ever
// submitted for them. Any failure is quiet; the manual form always works.

/** Form fields the reader can fill. `plan` covers the provider and plan picker. */
export type ScanTarget = 'orderNumberOrBtn' | 'customerName' | 'customerPhone' | 'customerAddress' | 'installDate' | 'plan' | 'notes';

/** Fields that show a skeleton while the screenshot is read. */
export const SCAN_SKELETON_TARGETS: ScanTarget[] = [
  'plan',
  'orderNumberOrBtn',
  'customerName',
  'customerPhone',
  'customerAddress',
  'installDate',
];

/** The first read only runs on a blank form: these are all still empty. */
const KEY_TARGETS: ScanTarget[] = ['plan', 'orderNumberOrBtn', 'customerAddress', 'installDate'];

const CLIENT_TIMEOUT_MS = 30_000;

export type ScanFill =
  | { target: Exclude<ScanTarget, 'plan'>; value: string }
  | { target: 'plan'; provider: string; planId: string | null };

export type ScanStatus = 'idle' | 'reading' | 'filled' | 'failed';

type Flag = Exclude<ScanConfidence, 'high'>;

/**
 * What to put where, given the reader's answer and which fields are still
 * open (empty and never typed in). Pure, so the fill rule is testable alone.
 */
export function planScanFills(
  fields: SaleScanFields,
  isOpen: (target: ScanTarget) => boolean
): { fills: ScanFill[]; flags: Partial<Record<ScanTarget, Flag>> } {
  const fills: ScanFill[] = [];
  const flags: Partial<Record<ScanTarget, Flag>> = {};
  const flag = (target: ScanTarget, read: ScanValue) => {
    if (read.confidence !== 'high') flags[target] = read.confidence;
  };

  const text = ['orderNumberOrBtn', 'customerName', 'customerPhone', 'customerAddress', 'installDate'] as const;
  for (const target of text) {
    const read = fields[target];
    if (!read?.value || !isOpen(target)) continue;
    fills.push({ target, value: read.value });
    flag(target, read);
  }

  if (fields.provider && isOpen('plan')) {
    const planId = fields.plan?.value ?? null;
    fills.push({ target: 'plan', provider: fields.provider.value, planId });
    // A provider with no plan is flagged too: the rep still has to pick one.
    flag('plan', fields.plan ?? { value: '', confidence: 'medium' });
  }

  if (fields.installWindow?.value && isOpen('notes')) {
    fills.push({ target: 'notes', value: `Install window: ${fields.installWindow.value}` });
  }

  return { fills, flags };
}

async function requestScan(paths: string[], signal: AbortSignal): Promise<SaleScanResponse | null> {
  const token = await getIdToken();
  const response = await fetch('/api/portal/sales/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ paths }),
    signal,
  });
  if (response.status === 404) return null;
  const data = (await response.json().catch(() => null)) as SaleScanResponse | null;
  return response.ok && data && 'fields' in data ? data : { fields: null, reason: `http_${response.status}` };
}

export function useSaleScan({
  enabled,
  paths,
  isEmpty,
  apply,
}: {
  /** The reader is switched on (saleScanEnabled). Off, nothing is ever read or shown. */
  enabled: boolean;
  /** The proof paths on the form now. */
  paths: string[];
  /** True while the form field has no value. */
  isEmpty: (target: ScanTarget) => boolean;
  /** Put the fills into the form. */
  apply: (fills: ScanFill[]) => void;
}) {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [flags, setFlags] = useState<Partial<Record<ScanTarget, Flag>>>({});

  // Read at call time, from async upload callbacks: always the latest render.
  const latest = useRef({ enabled, paths, isEmpty, apply });
  useEffect(() => {
    latest.current = { enabled, paths, isEmpty, apply };
  });

  // Fields the rep typed in or picked. The ref serves async reads; the state
  // re-renders the skeletons.
  const touchedRef = useRef(new Set<ScanTarget>());
  const [touched, setTouched] = useState<ReadonlySet<ScanTarget>>(() => new Set());
  const scanned = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  const queued = useRef(false);
  const everFilled = useRef(false);
  // Skipped by the rep, or the reader is switched off: no more reads this sale.
  const stopped = useRef(false);

  const isOpen = useCallback(
    (target: ScanTarget) => !touchedRef.current.has(target) && latest.current.isEmpty(target),
    []
  );

  const run = useCallback(
    async (extraPath?: string) => {
      if (stopped.current || !latest.current.enabled) return;
      const all = [...new Set([...latest.current.paths, ...(extraPath ? [extraPath] : [])])];
      const fresh = all.filter((p) => !scanned.current.has(p));
      if (fresh.length === 0) return;
      if (controller.current) {
        // One read at a time; the new screenshot is read once this one lands.
        queued.current = true;
        return;
      }
      const first = scanned.current.size === 0;
      for (const p of all) scanned.current.add(p);
      const worth = first ? KEY_TARGETS.every(isOpen) : SCAN_SKELETON_TARGETS.some(isOpen);
      if (!worth) return;

      const abort = new AbortController();
      controller.current = abort;
      const timer = setTimeout(() => abort.abort(), CLIENT_TIMEOUT_MS);
      setStatus('reading');
      let result: SaleScanResponse | null = null;
      try {
        result = await requestScan(all.slice(0, 4), abort.signal);
      } catch {
        result = { fields: null, reason: 'network' };
      } finally {
        clearTimeout(timer);
      }
      // Skipped while reading: drop the answer.
      if (controller.current !== abort) return;
      controller.current = null;

      if (result === null) {
        stopped.current = true;
        setStatus('idle');
        return;
      }
      const { fills, flags: newFlags } = result.fields
        ? planScanFills(result.fields, isOpen)
        : { fills: [], flags: {} };
      if (fills.length > 0) {
        latest.current.apply(fills);
        everFilled.current = true;
        markScanIntroUsed();
        setFlags((prev) => ({ ...prev, ...newFlags }));
        setStatus('filled');
      } else {
        // Nothing read, or nothing left to fill: only a first read that found
        // nothing says so; the rep already has what an earlier read gave.
        setStatus(everFilled.current ? 'filled' : result.fields ? 'idle' : 'failed');
      }
      if (queued.current) {
        queued.current = false;
        void run();
      }
    },
    [isOpen]
  );

  /** A proof upload finished (called from the upload queue, so it may be stale-bound). */
  const proofAdded = useCallback((path: string) => void run(path), [run]);

  /** The rep cancels the read: the form is theirs, no more reads for this sale. */
  const skip = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    queued.current = false;
    stopped.current = true;
    setStatus(everFilled.current ? 'filled' : 'idle');
  }, []);

  /** The rep typed in (or picked) this field: never fill it, and it is checked. */
  const edited = useCallback((target: ScanTarget) => {
    touchedRef.current.add(target);
    setTouched((prev) => (prev.has(target) ? prev : new Set(prev).add(target)));
    setFlags((prev) => {
      if (!prev[target]) return prev;
      const next = { ...prev };
      delete next[target];
      return next;
    });
  }, []);

  /** The rep looked at a flagged field: it no longer needs the tag. */
  const seen = useCallback((target: ScanTarget) => {
    setFlags((prev) => {
      if (!prev[target]) return prev;
      const next = { ...prev };
      delete next[target];
      return next;
    });
  }, []);

  /** Start over: a new sale, so forget this one's reads, edits and flags. */
  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    queued.current = false;
    stopped.current = false;
    everFilled.current = false;
    scanned.current.clear();
    touchedRef.current.clear();
    setTouched(new Set());
    setFlags({});
    setStatus('idle');
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const reading = status === 'reading';
  return {
    status,
    flags,
    /** Show a skeleton on this field: a read is running and it may fill it. */
    pending: (target: ScanTarget) =>
      reading && SCAN_SKELETON_TARGETS.includes(target) && !touched.has(target) && isEmpty(target),
    proofAdded,
    skip,
    edited,
    seen,
    reset,
  };
}

export type SaleScan = ReturnType<typeof useSaleScan>;
