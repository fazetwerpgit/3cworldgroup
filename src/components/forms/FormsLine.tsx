'use client';

import Link from 'next/link';
import { ArrowLeft, Check, ChevronRight, type LucideIcon } from 'lucide-react';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';

export const FORMS_LINE_ORDER = [
  { slug: 'fiber-report', title: 'Fiber Report', lane: '01' },
  { slug: 'expedite-order', title: 'Expedite Order', lane: '02' },
  { slug: 'payroll-dispute', title: 'Payroll Dispute', lane: '03' },
  { slug: 'leads-request', title: 'Leads Request', lane: '04' },
  { slug: 'manager-interview', title: 'Manager Interview', lane: '05' },
] as const;

export function FormsLineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="forms-line-main flex-1 overflow-auto">
          <div className="forms-line">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function FormsLineSection({
  index,
  title,
  children,
  identity,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
  identity?: React.ReactNode;
}) {
  const number = String(index).padStart(2, '0');
  return (
    <section className="forms-line-section" aria-labelledby={`forms-line-section-${number}`}>
      <div className="forms-line-section-label">
        <span className="forms-line-section-index">{number}</span>
        <p className="forms-line-eyebrow" id={`forms-line-section-${number}`}>
          Section {number} / {title}
        </p>
      </div>
      {identity}
      <div className="forms-line-form-grid">{children}</div>
    </section>
  );
}

export function FormsLineControl({
  id,
  label,
  required = false,
  className = '',
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`forms-line-field ${className}`}>
      <label htmlFor={id}>
        {required && <span className="forms-line-req" aria-hidden="true">●</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

export function FormsLineChoicePicker({
  name,
  label,
  value,
  options,
  onChange,
  required = false,
  dependent = false,
  emptyMessage = 'No options configured yet.',
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  dependent?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className={`forms-line-choice-group${dependent ? ' forms-line-choice-dependent' : ''}`} role="group" aria-labelledby={`${name}-label`}>
      <p className="forms-line-choice-label" id={`${name}-label`}>Choose one / {label}</p>
      {options.length > 0 ? (
        <div className="forms-line-choice-grid">
          {options.map((option) => (
            <button
              key={option}
              className="forms-line-choice-button"
              type="button"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
            >
              {/* Zero-width space after "/" lets long labels break there instead of mid-word */}
              {option.replaceAll('/', '/​')}
            </button>
          ))}
        </div>
      ) : (
        <p className="forms-line-choice-empty">{emptyMessage}</p>
      )}
      <p className="forms-line-choice-summary">
        {value ? `${value} selected` : 'No selection yet'}
      </p>
      <input type="hidden" name={name} value={value} required={required} />
    </div>
  );
}

export function FormsLineIdentity({ name, role }: { name: string; role: string }) {
  return (
    <p className="forms-line-identity">
      Submitting as <strong>{name}</strong><span>·</span>{role}
    </p>
  );
}

export function FormsLineFormHeader({ title, lane }: { title: string; lane: string }) {
  const titleId = `${title.toLowerCase().replace(/\s+/g, '-')}-title`;
  return (
    <header className="forms-line-fill-head">
      <div>
        <Link className="forms-line-back-link" href="/portal/forms">
          <ArrowLeft aria-hidden="true" /> Back to forms
        </Link>
        <h2 id={titleId}>{title}</h2>
      </div>
      <p>Representative fill / lane {lane} of 5</p>
    </header>
  );
}

export function FormsLineRail({
  status,
  note,
}: {
  status: string;
  note: string;
}) {
  return (
    <aside className="forms-line-rail">
      <span>Route status</span>
      <strong>{status}</strong>
      <span>Review note</span>
      <strong>{note}</strong>
      <span>Representative fill<br />real submission</span>
    </aside>
  );
}

export function FormsLineAlert({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`forms-line-alert forms-line-alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function FormsLineSuccess({ title, message, referenceId }: { title: string; message: string; referenceId: string }) {
  return (
    <div className="forms-line-success" role="status">
      <span className="forms-line-success-mark"><Check aria-hidden="true" /></span>
      <div>
        <strong>{title} · Reference: {referenceId}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function FormsLineActions({
  verb,
  saving,
  disabled = false,
}: {
  verb: string;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="forms-line-actions">
      <button className="forms-line-primary" type="submit" disabled={saving || disabled}>
        {saving ? 'Submitting…' : `Submit ${verb} →`}
      </button>
    </div>
  );
}

export function FormsLineHubRow({
  lane,
  title,
  description,
  audience,
  meta,
  href,
  icon: Icon,
}: {
  lane: string;
  title: string;
  description: string;
  audience: string;
  meta: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <article className="forms-line-row">
      <span className="forms-line-row-number">{lane}</span>
      <Icon className="forms-line-row-icon" aria-hidden="true" />
      <div className="forms-line-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="forms-line-row-audience">
        <b>{audience}</b>
        {meta}
      </div>
      <Link className="forms-line-row-action" href={href}>Open form</Link>
      <ChevronRight className="forms-line-row-chevron" aria-hidden="true" />
    </article>
  );
}
