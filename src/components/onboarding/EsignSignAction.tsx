'use client';

import Link from 'next/link';
import s from '@/components/portal/rep/rep.module.css';
import o from './onboarding.module.css';

interface Props {
  /** The in-app signing page for this document. */
  signPath: string;
}

// Opens the document's signing page. Signing there completes the item on the
// server, so the checklist shows it approved when the rep comes back.
export function EsignSignAction({ signPath }: Props) {
  return (
    <Link href={signPath} className={`${s.btnPrimary} ${o.submit}`}>
      Sign now
    </Link>
  );
}

export default EsignSignAction;
