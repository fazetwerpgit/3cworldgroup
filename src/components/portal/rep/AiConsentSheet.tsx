'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSheetDismiss } from '@/hooks/useSheetDismiss';
import { agreeToAi } from '@/lib/ai/consentClient';
import type { AiProvider } from '@/lib/ai/consent';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';
import c from './ai-consent-sheet.module.css';

// The one-time AI consent sheet (App Store 5.1.2(i)), shown before an AI
// feature first sends anything to its provider: Ask 3C (DeepSeek) and the
// sale screenshot scan (Google Gemini). It names the provider, says what is
// sent and why, and links the privacy policy. "Agree" stamps the consent on
// the server (POST /api/portal/ai-consent); "Not now" just closes.

const COPY: Record<AiProvider, { title: string; body: React.ReactNode; declined: string }> = {
  deepseek: {
    title: 'Ask 3C uses AI from DeepSeek',
    body: (
      <>
        <p>
          To answer you, Ask 3C sends DeepSeek, an AI company, your question, the earlier messages in this
          chat, any photo you add, and your own portal info: your first name, your area, your dealer code,
          and your sales, installs and Board spot.
        </p>
        <p>
          <strong>No customer names, addresses, phone numbers or emails are sent.</strong> Teammates show as
          numbers, not names. Emails and phone numbers you type are taken out first.
        </p>
        <p>It&apos;s used only to answer your questions.</p>
      </>
    ),
    declined: 'Not now closes this. Ask 3C stays off until you agree.',
  },
  gemini: {
    title: 'Read this screenshot with AI?',
    body: (
      <>
        <p>
          To fill in the sale form for you, we send the screenshot you chose to Google Gemini, an AI service.
          It can show the customer&apos;s name, address, phone and order number.
        </p>
        <p>
          Google doesn&apos;t use it to train its models. You check every field before you submit.
        </p>
      </>
    ),
    declined: 'Not now? You can still type the sale in yourself.',
  },
};

export function AiConsentSheet({
  provider,
  onAgreed,
  onClose,
}: {
  provider: AiProvider;
  /** Saved: the feature can go ahead. */
  onAgreed: () => void;
  /** "Not now", the X, Escape or a tap outside. */
  onClose: () => void;
}) {
  const agreeRef = useRef<HTMLButtonElement | null>(null);
  const { close, closing, sheetRef, backdropRef } = useSheetDismiss<HTMLElement>(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[provider];
  const titleId = `ai-consent-${provider}-title`;

  useEffect(() => {
    agreeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const agree = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const saved = await agreeToAi(provider);
    setSaving(false);
    if (saved) onAgreed();
    else setError("That didn't save. Check your signal and try again.");
  };

  return (
    <BodyLayer>
      <div
        ref={backdropRef}
        className={s.backdrop}
        data-closing={closing || undefined}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section
          ref={sheetRef}
          className={s.sheet}
          data-closing={closing || undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id={titleId} className={s.sheetTitle}>
              {copy.title}
            </h2>
            <button type="button" className={s.iconBtn} aria-label="Close" onClick={close}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={s.sheetBody}>
            <div className={d.help}>
              {copy.body}
              <p>
                {copy.declined}{' '}
                <a className={c.link} href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy policy
                </a>
              </p>
              {error ? (
                <p className={c.error} role="alert">
                  {error}
                </p>
              ) : null}
              <div className={c.actions}>
                <button type="button" className={s.btnSecondary} onClick={close} disabled={saving}>
                  Not now
                </button>
                <button ref={agreeRef} type="button" className={s.btnPrimary} onClick={() => void agree()} disabled={saving}>
                  {saving ? 'Saving…' : 'Agree'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
