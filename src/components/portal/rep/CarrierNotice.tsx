'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';
import s from './rep.module.css';
import n from './carrier-notice.module.css';

/**
 * The carrier report did not load. The rep's numbers still show, but carrier
 * cancellations and missed installs are unknown, so this says the estimates
 * may be off rather than letting them pass as complete.
 */
export function CarrierNotice({
  onRetry,
  retrying = false,
  className = '',
}: {
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div className={`${n.notice} ${className}`} role="status">
      <AlertTriangle size={16} strokeWidth={2.25} aria-hidden="true" className={n.icon} />
      <p className={n.text}>Carrier report didn&apos;t load, estimates may be off</p>
      <button type="button" className={s.retry} onClick={onRetry} disabled={retrying}>
        <RotateCw size={14} aria-hidden="true" />
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
