'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { LegalLinks } from '@/components/app/LegalLinks';
import s from '@/components/portal/rep/rep.module.css';
import c from './chat.module.css';

export const CHAT_SUPPORT_EMAIL = 'info@3cworldgroup.com';

/**
 * The one-time chat agreement (App Store guideline 1.2): shown in the app the
 * first time someone opens team chat, until they agree. No backdrop dismiss and
 * no Esc: the only ways out are agreeing or leaving chat.
 */
export function ChatTermsSheet({ onAccept }: { onAccept: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const agreeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    agreeRef.current?.focus({ preventScroll: true });
  }, []);

  const agree = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  };

  return (
    <BodyLayer>
      <div className={s.backdrop}>
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="chat-terms-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="chat-terms-title" className={s.sheetTitle}>
              Before you chat
            </h2>
          </div>
          <div className={`${s.sheetBody} ${c.terms}`}>
            <p>Team chat is for 3C work. 3C has zero tolerance for objectionable content or abusive behavior.</p>
            <ul>
              <li>Keep it professional. No harassment, hate, threats or sexual content.</li>
              <li>Keep customer details out. Never post card numbers, SSNs or account logins.</li>
              <li>
                Press and hold any message to report it or block the person who sent it. Admins review every report
                and remove content and people who break these rules.
              </li>
            </ul>
            <p className={c.termsHelp}>
              Questions or a problem with someone? Email <a href={`mailto:${CHAT_SUPPORT_EMAIL}`}>{CHAT_SUPPORT_EMAIL}</a>.
            </p>
            <LegalLinks />
            {error ? (
              <p className={c.termsError} role="alert">
                {error}
              </p>
            ) : null}
            <div className={c.termsActions}>
              <button ref={agreeRef} type="button" className={s.btnPrimary} onClick={agree} disabled={saving}>
                {saving ? 'Saving' : 'Agree and continue'}
              </button>
              <Link href="/portal" className={s.btnSecondary}>
                Not now
              </Link>
            </div>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
