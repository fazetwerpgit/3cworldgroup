'use client';

import Link from 'next/link';
import { ExternalLink, Phone } from 'lucide-react';
import { RepShell } from '@/components/portal/rep/RepShell';
import { ESCALINK_ISSUE_TYPES, ESCALINK_URL, FIBER_SUPPORT_PHONE } from '@/lib/escalink';
import { telHref } from '@/lib/phone';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import e from './escalink.module.css';

// EscaLink, T-Mobile's ticket app for D2D order support (launched 2026-10-01),
// from T-Mobile's training guide. The portal can't file tickets for reps — the
// app lives in T-Mobile's Microsoft tenant — so this page is the how-to, and
// each T-Mobile sale has a "Copy details" button that fills in the intake.

const STEPS = [
  {
    title: 'Intake',
    text: 'Open EscaLink and tap Intake. Choose Install / Order Support (the only one for D2D). Submitter type: D2D Agents, then your dealer code.',
    image: '/escalink/step1.webp',
    alt: 'EscaLink New Escalation screen with Install / Order Support selected',
  },
  {
    title: 'Fill it in once',
    text: 'Pick the issue type (below), paste the sale details, add screenshots or the error message, and say exactly what you need Fiber Support to do.',
  },
  {
    title: 'My Submissions',
    text: 'Track every ticket you sent and its status. Check here before opening another one for the same customer.',
    image: '/escalink/step2.webp',
    alt: 'EscaLink My Submissions list with ticket statuses',
  },
  {
    title: 'Inbox',
    text: 'Support asks for more details here. Answer in the ticket quickly so it does not stall.',
    image: '/escalink/step3.webp',
    alt: 'EscaLink Inbox with a ticket conversation',
  },
];

function EscalinkGuide() {
  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>EscaLink</h1>
        <p className={p.lede}>
          T-Mobile&apos;s ticket app for install and order problems that T-Mobile Fiber Support has to fix. If
          EscaLink won&apos;t let you in, ask Jeremy or Jacob.
        </p>
      </header>

      <div className={e.actions}>
        <a className={s.btnPrimary} href={ESCALINK_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={18} aria-hidden="true" />
          Open EscaLink
        </a>
        <a className={s.btnSecondary} href={telHref(FIBER_SUPPORT_PHONE)}>
          <Phone size={16} aria-hidden="true" />
          Fiber Support {FIBER_SUPPORT_PHONE}
        </a>
      </div>

      <section className={s.panel} aria-labelledby="esc-which">
        <div className={s.panelHead}>
          <h2 id="esc-which" className={s.kicker}>EscaLink or a 3C form?</h2>
        </div>
        <ul className={e.list}>
          <li>
            <b>EscaLink:</b> T-Mobile has to look at or fix the order: address problems, buyflow errors, an install
            that is stuck, a missing promo, or a reschedule the customer won&apos;t do in the T-Life app.
          </li>
          <li>
            <b>
              <Link href="/portal/expedite-order">Expedite order</Link>:
            </b>{' '}
            you want 3C to push for a faster install.
          </li>
          <li>
            <b>
              <Link href="/portal/payroll-dispute">Payroll dispute</Link>:
            </b>{' '}
            an install is missing from your pay or paid wrong.
          </li>
          <li>EscaLink is never for a customer who is already active: they call Fiber Care themselves.</li>
        </ul>
      </section>

      <section className={s.panel} aria-labelledby="esc-steps">
        <div className={s.panelHead}>
          <h2 id="esc-steps" className={s.kicker}>How it works</h2>
        </div>
        <ol className={e.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={e.step}>
              <span className={e.stepNum} aria-hidden="true">{index + 1}</span>
              <div className={e.stepBody}>
                <h3 className={e.stepTitle}>{step.title}</h3>
                <p className={e.stepText}>{step.text}</p>
                {step.image ? (
                  // Static screenshots from T-Mobile's training guide.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={e.shot} src={step.image} alt={step.alt} loading="lazy" />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.panel} aria-labelledby="esc-include">
        <div className={s.panelHead}>
          <h2 id="esc-include" className={s.kicker}>What to include</h2>
        </div>
        <ul className={e.list}>
          <li>Submitter: D2D Agents and your dealer code.</li>
          <li>Customer: name, phone, and the full service address.</li>
          <li>Order: order number, BAN, install date or appointment status, when you have them.</li>
          <li>Issue: what happened and where, the error message, and screenshots.</li>
          <li>Ask: exactly what you need Fiber Support to do.</li>
        </ul>
        <p className={e.tip}>
          Shortcut: open the sale in <Link href="/portal/sales">Sales</Link> and tap <b>Copy details</b> under T-Mobile
          support. It copies your dealer code, the customer, address, order number, plan and install date.
        </p>
      </section>

      <section className={s.panel} aria-labelledby="esc-types">
        <div className={s.panelHead}>
          <h2 id="esc-types" className={s.kicker}>Which issue type</h2>
        </div>
        <dl className={e.types}>
          {ESCALINK_ISSUE_TYPES.map((type) => (
            <div key={type.name} className={e.type}>
              <dt>{type.name}</dt>
              <dd>{type.use}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.panel} aria-labelledby="esc-rules">
        <div className={s.panelHead}>
          <h2 id="esc-rules" className={s.kicker}>Do and don&apos;t</h2>
        </div>
        <ul className={e.list}>
          <li>One ticket per customer and issue. Updates go in the same ticket, never a new one.</li>
          <li>Read Support&apos;s latest notes before following up.</li>
          <li>After Support makes a change, give it time to update before trying again.</li>
          <li>Don&apos;t contact T-Mobile&apos;s partner teams directly unless Jeremy or Jacob tells you to.</li>
          <li>
            Need help right now? Call Fiber Support at{' '}
            <a href={telHref(FIBER_SUPPORT_PHONE)}>{FIBER_SUPPORT_PHONE}</a>.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function EscalinkPage() {
  return (
    <RepShell>
      <EscalinkGuide />
    </RepShell>
  );
}
