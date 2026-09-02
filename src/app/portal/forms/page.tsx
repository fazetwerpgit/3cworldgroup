'use client';

import {
  BarChart3,
  CheckSquare,
  ReceiptText,
  Users,
  Zap,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import {
  FORMS_LINE_ORDER,
  FormsLineHubRow,
  FormsLineShell,
} from '@/components/forms/FormsLine';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/sweep-rep-a.css';

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
  'regional_manager',
  'director',
] as const;

const formRows = [
  {
    ...FORMS_LINE_ORDER[0],
    description: 'Log door-knocking + fiber sales for a pack.',
    audience: 'Field reps',
    icon: BarChart3,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[1],
    description: "Request a faster customer install when timing matters.",
    audience: 'Reps + managers',
    icon: Zap,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[2],
    description: 'Report missing or incorrect pay — attach proof.',
    audience: 'Everyone',
    icon: ReceiptText,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[3],
    description: 'Request lead packs or report a territory issue.',
    audience: 'Field reps',
    icon: Users,
    managerOnly: false,
  },
  {
    ...FORMS_LINE_ORDER[4],
    description: 'Complete a final candidate interview with a signature.',
    audience: 'Managers only',
    icon: CheckSquare,
    managerOnly: true,
  },
];

export default function FormsPage() {
  const { isRole } = useAuth();
  const canOpenManagerInterview = isRole(...managerInterviewRoles);
  const visibleForms = formRows.filter((form) => !form.managerOnly || canOpenManagerInterview);

  return (
    <ProtectedRoute>
      <FormsLineShell>
        <PageTitle title="Forms" meta={`${visibleForms.length} forms`} />

        <section className="forms-line-list" aria-labelledby="forms-line-list-title">
          <h2 id="forms-line-list-title" className="sr-only">Choose a form</h2>
          <div>
            {visibleForms.map((form) => (
              <FormsLineHubRow
                key={form.slug}
                title={form.title}
                description={form.description}
                audience={form.audience}
                href={`/portal/${form.slug}`}
              />
            ))}
          </div>
        </section>
      </FormsLineShell>
    </ProtectedRoute>
  );
}
