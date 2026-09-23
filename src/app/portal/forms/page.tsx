'use client';

import Link from 'next/link';
import { BarChart3, CheckSquare, ChevronRight, ReceiptText, Users, Zap, type LucideIcon } from 'lucide-react';
import { RepShell } from '@/components/portal/rep/RepShell';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { canOpenManagerInterview } from '@/lib/forms/managerInterview';

// Forms hub, direction D. Payroll dispute leads: it is the one the dashboard
// sends reps to ("Missing an install?").

const FORMS: Array<{
  href: string;
  title: string;
  description: string;
  tag?: string;
  icon: LucideIcon;
  managerOnly?: boolean;
}> = [
  {
    href: '/portal/payroll-dispute',
    title: 'Payroll dispute',
    description: 'Install missing from your pay, or paid wrong. Attach proof.',
    icon: ReceiptText,
  },
  {
    href: '/portal/expedite-order',
    title: 'Expedite order',
    description: 'Ask for a faster install when the timing matters.',
    icon: Zap,
  },
  {
    href: '/portal/fiber-report',
    title: 'Fiber report',
    description: "Log a pack's door knocking and fiber sales.",
    tag: 'Field reps',
    icon: BarChart3,
  },
  {
    href: '/portal/leads-request',
    title: 'Leads request',
    description: 'Ask for a lead pack, or flag a territory problem.',
    tag: 'Field reps',
    icon: Users,
  },
  {
    href: '/portal/manager-interview',
    title: 'Manager interview',
    description: 'Record a final candidate interview and sign off.',
    tag: 'Managers',
    icon: CheckSquare,
    managerOnly: true,
  },
];

function FormsHub() {
  const { isRole } = useAuth();
  const canOpen = canOpenManagerInterview(isRole);
  const visible = FORMS.filter((form) => !form.managerOnly || canOpen);

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
