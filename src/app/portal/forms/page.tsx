'use client';

import {
  BarChart3,
  CheckSquare,
  ReceiptText,
  Users,
  Zap,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  FORMS_LINE_ORDER,
  FormsLineHubRow,
  FormsLineShell,
} from '@/components/forms/FormsLine';
import { useAuth } from '@/contexts/AuthContext';

const managerInterviewRoles = [
  'admin',
  'operations',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'general_manager',
  'office_manager',
] as const;

const formRows = [
  {
    ...FORMS_LINE_ORDER[0],
    description: 'Log door-knocking + fiber sales for a pack.',
    audience: 'Field reps',
    meta: 'sales proof / activity',
    icon: BarChart3,
    guided: false,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[1],
    description: "Request a faster customer install when timing matters.",
    audience: 'Reps + managers',
    meta: 'install priority',
    icon: Zap,
    guided: true,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[2],
    description: 'Report missing or incorrect pay — attach proof.',
    audience: 'All contractors',
    meta: 'screenshot accepted',
    icon: ReceiptText,
    guided: true,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[3],
    description: 'Request lead packs or report a territory issue.',
    audience: 'Field reps',
    meta: 'long conditional form',
    icon: Users,
    guided: true,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[4],
    description: 'Complete a final candidate interview with a signature.',
    audience: 'Managers only',
    meta: 'final step / signature',
    icon: CheckSquare,
    guided: true,
    managerOnly: true,
  },
];

export default function FormsPage() {
  const { isRole } = useAuth();
  const canOpenManagerInterview = isRole(...managerInterviewRoles);
  const visibleForms = formRows.filter((form) => !form.managerOnly || canOpenManagerInterview);
  const guidedRoutes = formRows.filter((form) => form.guided).length;
  const managerOnly = formRows.filter((form) => form.managerOnly).length;

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <section className="forms-line-command" aria-labelledby="forms-line-command-title">
          <div className="forms-line-command-top">
            <div>
              <p className="forms-line-eyebrow">03 / The Line / forms broadcast</p>
              <h1 id="forms-line-command-title"><span>{visibleForms.length} forms</span> on the board.</h1>
              <p className="forms-line-context">
                Five routes, one clean signal. Open the form that matches the work, keep the language plain, and let the request move to the right owner.
              </p>
            </div>
            <div className="forms-line-hero-number">
              <strong className="forms-line-display portal-metallic-num">{visibleForms.length}</strong>
              <small>forms available<br />the line is open</small>
            </div>
          </div>
          <div className="forms-line-signal-strip" aria-label="Forms summary">
            <div className="forms-line-signal">
              <span className="forms-line-signal-label">Forms available</span>
              <div className="forms-line-signal-number"><strong className="forms-line-signal-value portal-metallic-num">{visibleForms.length}</strong></div>
              <span className="forms-line-signal-note">All lanes are live</span>
            </div>
            <div className="forms-line-signal">
              <span className="forms-line-signal-label">Guided routes</span>
              <div className="forms-line-signal-number"><strong className="forms-line-signal-value portal-metallic-num">{guidedRoutes}</strong></div>
              <span className="forms-line-signal-note">Payroll includes proof</span>
            </div>
            <div className="forms-line-signal">
              <span className="forms-line-signal-label">Manager only</span>
              <div className="forms-line-signal-number"><strong className="forms-line-signal-value portal-metallic-num">{managerOnly}</strong></div>
              <span className="forms-line-signal-note">Final interview + signature</span>
            </div>
          </div>
        </section>

        <section className="forms-line-list" aria-labelledby="forms-line-list-title">
          <div className="forms-line-section-head">
            <div>
              <p className="forms-line-eyebrow">Priority ordered / next request</p>
              <h2 id="forms-line-list-title">Choose your lane</h2>
            </div>
            <p>{visibleForms.length} forms<br />ready to open</p>
          </div>
          <div>
            {visibleForms.map((form) => (
              <FormsLineHubRow
                key={form.slug}
                lane={form.lane}
                title={form.title}
                description={form.description}
                audience={form.audience}
                meta={form.meta}
                href={`/portal/${form.slug}`}
                icon={form.icon}
              />
            ))}
          </div>
          <footer className="forms-line-footer">
            <span>Open the lane. Leave the signal clear.</span>
          </footer>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
