'use client';

import { useState } from 'react';
import s from './rep.module.css';

/**
 * "Clear all" at the foot of the bell panel. A clear that fails keeps the list
 * and says so, with the same button as the retry.
 */
export function ClearNotes({ clearAll }: { clearAll: () => Promise<boolean> }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');
  const run = async () => {
    setStatus('busy');
    setStatus((await clearAll()) ? 'idle' : 'failed');
  };

  return (
    <div className={s.noteFoot}>
      {status === 'failed' ? (
        <span className={s.noteFail} role="alert">
          Couldn&apos;t clear
        </span>
      ) : null}
      <button type="button" className={s.textBtn} disabled={status === 'busy'} onClick={() => void run()}>
        {status === 'failed' ? 'Retry' : 'Clear all'}
      </button>
    </div>
  );
}
