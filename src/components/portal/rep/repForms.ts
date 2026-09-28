import { BarChart3, CheckSquare, ReceiptText, Users, Zap, type LucideIcon } from 'lucide-react';

// Forms hub, direction D. Payroll dispute leads: it is the one the dashboard
// sends reps to ("Missing an install?").

export const REP_FORMS: Array<{
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
