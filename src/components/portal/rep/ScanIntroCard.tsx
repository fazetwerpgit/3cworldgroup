'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { saleScanEnabled } from '@/lib/sales/scan/flag';
import {
  dismissScanIntro,
  parseScanIntro,
  readScanIntroRaw,
  shouldShowScanIntro,
  subscribeScanIntro,
} from '@/lib/sales/scan/intro';
import { LOG_SALE_HREF } from './repNav';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';

/**
 * One-time Home card for the Log Sale screenshot reader (rules in
 * lib/sales/scan/intro.ts). Hidden during server render: whether it shows
 * depends on this browser's storage.
 */
export function ScanIntroCard({ now }: { now: Date }) {
  const raw = useSyncExternalStore<string | null | undefined>(subscribeScanIntro, readScanIntroRaw, () => undefined);
  if (raw === undefined) return null;
  const show = shouldShowScanIntro({
    enabled: saleScanEnabled(),
    launch: process.env.NEXT_PUBLIC_SALE_SCAN_LAUNCH,
    now,
    state: parseScanIntro(raw),
  });
  if (!show) return null;

  return (
    <section className={`${s.panel} ${d.scanIntro}`} aria-labelledby="scan-intro-h">
      <div className={d.scanIntroBody}>
        <h2 id="scan-intro-h" className={d.scanIntroTitle}>
          New: log a sale from a screenshot
        </h2>
        <p className={d.scanIntroText}>Add the order confirmation and the details fill in. Check them, then submit.</p>
        <Link href={LOG_SALE_HREF} className={`${s.btnPrimary} ${d.scanIntroCta}`}>
          Try it
        </Link>
      </div>
      <button type="button" className={`${s.iconBtn} ${d.scanIntroClose}`} onClick={dismissScanIntro} aria-label="Dismiss">
        <X size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </section>
  );
}
