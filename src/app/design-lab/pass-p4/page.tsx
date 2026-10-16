'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import SettingsPage from '@/app/portal/settings/page';
import MemberLineOnboardingBoard from '@/components/onboarding/MemberLineOnboardingBoard';
import type { WizardItem } from '@/components/onboarding/types';
import { ConsentCheck, DocumentFields, type FieldValues } from '@/components/esign/DocumentFields';
import { SignaturePad } from '@/components/esign/SignaturePad';
import type { EnvelopeView } from '@/lib/esign/envelopeView';
import { ONBOARDING_ITEMS, type OnboardingStatus } from '@/types/onboarding';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import o from '@/components/onboarding/onboarding.module.css';
import e from '@/components/esign/esign.module.css';

// Dev-only harness for taste pass package P4 (settings, onboarding, e-sign).
// No login, sample data only, nothing is ever submitted.
// ?view=settings|onboarding|sign

const STATES: OnboardingStatus[] = ['approved', 'submitted', 'rejected', 'not_started'];
const ITEMS: WizardItem[] = ONBOARDING_ITEMS.slice(0, 6).map((item, i) => ({
  ...item,
  status: STATES[i % STATES.length],
  reference: null,
  rejectionReason: STATES[i % STATES.length] === 'rejected' ? 'Photo is blurry. Retake it in good light.' : null,
  reviewerName: null,
  esignDispatch: null,
  signPath: null,
}));

const ENVELOPE: EnvelopeView = {
  envelopeId: 'demo',
  docKey: 'direct_deposit',
  name: 'Direct deposit form',
  status: 'sent',
  pageCount: 1,
  signerName: 'Jordan Reyes',
  signerEmail: 'jordan@example.com',
  fields: [
    { key: 'bank', type: 'text', label: 'Bank name', required: true, sensitive: false, value: 'First Bank', prefilled: true, page: 1 },
    { key: 'routing', type: 'text', label: 'Routing number', required: true, sensitive: true, value: '', prefilled: false, page: 1 },
    { key: 'checking', type: 'checkbox', label: 'Checking', required: false, sensitive: false, value: true, prefilled: false, page: 1 },
    { key: 'savings', type: 'checkbox', label: 'Savings', required: false, sensitive: false, value: false, prefilled: false, page: 1 },
  ],
};

function Onboarding() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={o.wrap}>
      <div>
        <MemberLineOnboardingBoard
          memberLabel="Jordan Reyes"
          items={ITEMS}
          progress={{ approved: 2, total: 6, complete: false }}
          renderItemAction={(item) => (
            <button type="button" className={`${s.btnSecondary} ${o.rowBtn}`} onClick={() => setOpen(item.id)}>
              Open
            </button>
          )}
          openItemId={open}
          onOpenItem={setOpen}
        />
      </div>
      <aside className={`${s.panel} ${o.aside}`} aria-labelledby="h">
        <h2 id="h" className={o.panelTitle}>How to finish an item</h2>
        <div className={o.asideItem}>
          <h3>Uploads</h3>
          <p>Take a clear photo of the whole document.</p>
        </div>
        <div className={o.asideItem}>
          <h3>Signing</h3>
          <p>Open the document, fill the fields, then sign.</p>
        </div>
      </aside>
    </div>
  );
}

function Sign() {
  const [values, setValues] = useState<FieldValues>(Object.fromEntries(ENVELOPE.fields.map((x) => [x.key, x.value])));
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  return (
    <div className={f.form} style={{ display: 'grid', gap: 24 }}>
      <section className={s.panel} style={{ padding: 16, display: 'grid', gap: 16 }}>
        <p className={e.pdfHint}>Pinch or use Zoom in to read the small print.</p>
        <button type="button" className={e.smallBtn}>Zoom in</button>
        <p className={e.pdfError}>This page didn&apos;t load. Try again.</p>
        <DocumentFields
          envelope={ENVELOPE}
          values={values}
          unlocked={unlocked}
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
          onUnlock={(k) => setUnlocked((cur) => ({ ...cur, [k]: true }))}
        />
      </section>
      <section className={s.panel} style={{ padding: 16, display: 'grid', gap: 16 }}>
        <SignaturePad value={null} signerName="Jordan Reyes" onChange={() => {}} />
        <ConsentCheck checked={consent} onChange={setConsent} />
      </section>
    </div>
  );
}

function Harness() {
  const view = useSearchParams().get('view') ?? 'settings';
  return (
    <AuthProvider>
      <div className={s.root} data-shell="rep">
        <main className={s.scroller} id="rep-main">
          <div className={s.main}>{view === 'onboarding' ? <Onboarding /> : view === 'sign' ? <Sign /> : <SettingsPage />}</div>
        </main>
      </div>
    </AuthProvider>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Harness />
    </Suspense>
  );
}
