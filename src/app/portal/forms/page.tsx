'use client';

import Link from 'next/link';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { RepShell } from '@/components/portal/rep/RepShell';
import { REP_FORMS } from '@/components/portal/rep/repForms';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { canOpenManagerInterview } from '@/lib/forms/managerInterview';

function FormsHub() {
  const { isRole } = useAuth();
  const canOpen = canOpenManagerInterview(isRole);
  const visible = REP_FORMS.filter((form) => !form.managerOnly || canOpen);

  return (
    <>
      <header className={f.hubHead}>
        <h1 className={f.hubTitle}>Forms</h1>
        <span className={f.hubCount}>{visible.length} forms</span>
      </header>
      <p className={f.hubLede}>Send a request to the office.</p>

      <ul className={`${s.panel} ${f.hubList}`} aria-label="Forms">
        {visible.map(({ href, title, description, tag, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={f.hubRow}>
              <span className={f.hubIcon} aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className={f.hubText}>
                <span className={f.hubName}>{title}</span>
                <span className={f.hubDesc}>{description}</span>
                {tag ? <span className={f.hubTag}>{tag}</span> : null}
              </span>
              <ChevronRight size={20} className={f.hubChev} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Not a 3C form: T-Mobile's own ticket app, so it sits apart from the office list. */}
      <ul className={`${s.panel} ${f.hubList}`} aria-label="T-Mobile support">
        <li>
          <Link href="/portal/escalink" className={f.hubRow}>
            <span className={f.hubIcon} aria-hidden="true">
              <LifeBuoy size={20} strokeWidth={2} />
            </span>
            <span className={f.hubText}>
              <span className={f.hubName}>EscaLink (T-Mobile)</span>
              <span className={f.hubDesc}>Install or order problem T-Mobile Fiber Support has to fix.</span>
            </span>
            <ChevronRight size={20} className={f.hubChev} aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </>
  );
}

export default function FormsPage() {
  return (
    <RepShell>
      <FormsHub />
    </RepShell>
  );
}
