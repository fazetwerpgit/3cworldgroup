'use client';

import { carrierStaleLine, type CarrierReportStamp } from '@/lib/fiberReport/reportFreshness';

/**
 * One muted line when the carrier's daily report is late; nothing otherwise,
 * so the normal case has no layout change. The caller passes the meta-text
 * class of the spot it sits in.
 */
export function CarrierStaleNote({
  report,
  className,
  now,
}: {
  report: CarrierReportStamp | null | undefined;
  className?: string;
  now?: Date;
}) {
  const line = carrierStaleLine(report, now);
  return line ? <p className={className}>{line}</p> : null;
}
