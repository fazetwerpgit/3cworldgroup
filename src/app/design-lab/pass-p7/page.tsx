'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthProvider, AuthSubjectProvider } from '@/contexts/AuthContext';
import type { User } from '@/types';
import SettingsPage from '@/app/portal/admin/settings/page';
import RequestsPage from '@/app/portal/admin/requests/page';
import { OpsQueuesPanel } from '@/components/portal/admin-d/OpsQueuesPanel';
import s from '@/components/portal/rep/rep.module.css';

// Dev-only harness for taste pass package P7 (Admin Requests and Settings).
// No login and no network: every /api/ call is answered below with sample
// data, so nothing reaches the server (and nothing writes).
// ?page=settings&tab=system|form-options|chat-channels|email-templates|university|pay-rates|employee-data|ask
// ?page=requests&type=payroll-disputes|expedite-orders|leads-requests|fiber-reports|manager-interviews|bug-reports
// ?page=ops (Home's Needs attention panel)

const OWNER = {
  uid: 'lab-owner',
  id: 'lab-owner',
  email: 'owner@example.com',
  displayName: 'Lab Owner',
  role: 'owner',
} as unknown as User;

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const REQUESTS: Record<string, Record<string, unknown>[]> = {
  'payroll-dispute': [
    { id: 'p1', status: 'new', repName: 'Dana Alvarez', contractorName: 'Dana Alvarez', contractorEmail: 'dana@example.com', campaign: 'AT&T Fiber', typeOfOrder: 'New install', dateOfInstall: '2026-10-02', orderScreenshotPath: 'x/order.png', createdAt: ago(5) },
    { id: 'p2', status: 'new', repName: 'Marcus Reed', contractorName: 'Marcus Reed', contractorEmail: 'marcus@example.com', campaign: 'T-Fiber', typeOfOrder: 'Upgrade', dateOfInstall: '2026-09-28', createdAt: ago(30) },
    { id: 'p3', status: 'handled', repName: 'Ada Okafor', contractorName: 'Ada Okafor', contractorEmail: 'ada@example.com', campaign: 'AT&T Fiber', typeOfOrder: 'New install', dateOfInstall: '2026-09-20', createdAt: ago(80) },
  ],
  'expedite-order': [
    { id: 'e1', status: 'new', repName: 'Marcus Reed', customerName: 'Leo Park', customerEmail: 'leo@example.com', customerPhone: '555-0101', orderNumber: 'ATT-448812', address: '12 Elm St', city: 'Dallas', state: 'TX', zip: '75201', expediteDates: 'Oct 18 or Oct 19', reason: 'Customer works from home and lost service.', createdAt: ago(3) },
  ],
  'leads-request': [
    { id: 'l1', status: 'new', repName: 'Ada Okafor', repFirstName: 'Ada', repLastName: 'Okafor', campaign: 'AT&T Fiber', category: 'New pack', location: 'Plano, TX', managerName: 'Sam Lee', managerEmail: 'sam@example.com', reason: 'Finished current pack', leadPackCode: 'PL-22', situationDescription: 'Pack fully knocked twice.', createdAt: ago(9) },
  ],
  'fiber-report': [
    { id: 'f1', status: 'new', repName: 'Dana Alvarez', companySold: 'T-Fiber', dateKnocked: '2026-10-14', doorsKnocked: 84, customerContacts: 31, numberOfSales: 4, numberOfReps: 2, packNumber: 'TF-7', orderNumber: 'TF-99812', createdAt: ago(20) },
  ],
  'manager-interview': [
    { id: 'm1', status: 'new', repName: 'Sam Lee', candidateFirstName: 'Jordan', candidateLastName: 'Mills', candidateEmail: 'jordan@example.com', provider: 'AT&T', market: 'Dallas', jobPosition: 'Sales rep', hiringManager: 'Sam Lee', hiringManagerEmail: 'sam@example.com', didShow: true, extendOffer: true, rating: 4, completedReading: true, completedProduction: false, completedTeamMetric: true, signatureDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><path d="M10 60 C60 10 90 70 140 30 S220 60 290 20" stroke="black" fill="none" stroke-width="3"/></svg>', createdAt: ago(12) },
  ],
  'bug-report': [
    { id: 'b1', status: 'new', repName: 'Marcus Reed', repEmail: 'marcus@example.com', area: 'Sales', summary: 'Install date picker closes early', details: 'On iPhone the date picker closes when I scroll the month.', pageUrl: '/portal/sales', createdAt: ago(2) },
    { id: 'b2', status: 'handled', repName: 'Ada Okafor', repEmail: 'ada@example.com', area: 'Leaderboard', summary: 'Rank shows twice', details: 'Saw my name twice this morning.', pageUrl: '/portal/leaderboard', createdAt: ago(60) },
  ],
};

const OPTIONS = {
  providers: ['AT&T', 'T-Mobile', 'Verizon'],
  expediteReasons: ['Works from home', 'Medical', 'Other'],
  payrollCampaigns: ['AT&T Fiber', 'T-Fiber', 'Verizon', 'Xfinity'],
  leadsCampaigns: ['AT&T Fiber', 'T-Fiber'],
  leadsManagers: ['Sam Lee', 'Rita Cole'],
  leadsLocations: ['Plano, TX', 'Frisco, TX'],
  hireManagers: ['Sam Lee'],
  hireJobPositions: ['Sales rep', 'Team lead'],
  hireMarkets: [],
};

function answer(url: string, init?: RequestInit): unknown {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (init?.method && init.method !== 'GET' && !path.startsWith('/api/portal/admin/employee-import')) return { ok: true };
  const review = path.match(/^\/api\/portal\/forms\/([a-z-]+)\/review/);
  if (review) return { submissions: REQUESTS[review[1]] ?? [] };
  if (path.startsWith('/api/portal/forms/options')) return { options: OPTIONS };
  if (path.startsWith('/api/portal/forms/alerts'))
    return {
      forms: [
        { key: 'payroll-dispute', label: 'Payroll dispute', enabled: true },
        { key: 'expedite-order', label: 'Expedite order', enabled: false },
        { key: 'bug-report', label: 'Bug report', enabled: true },
      ],
    };
  if (path.startsWith('/api/portal/settings/weekly-challenge')) return { targetSales: 7 };
  if (path.startsWith('/api/portal/chat/channels/manage'))
    return {
      channels: [
        { id: 'c1', name: 'General', description: 'Everyone on the team.', audience: 'all', order: 0, active: true, memberCount: 42 },
        { id: 'c2', name: 'Managers', description: 'Leads and managers only.', audience: 'managers', order: 1, active: true, memberCount: 6 },
        { id: 'c3', name: 'Old Dallas', description: 'Archived market channel.', audience: 'all', order: 2, active: false, memberCount: 0 },
      ],
    };
  if (path.startsWith('/api/portal/email-templates'))
    return {
      templates: [
        { id: 't1', name: 'Welcome aboard', category: 'onboarding', subject: 'Welcome to 3C, {{firstName}}', body: 'Hi {{firstName}}, your first day is {{startDate}}. Bring your ID.', createdByName: 'Lab Owner', updatedAt: ago(26) },
        { id: 't2', name: 'Interview invite', category: 'recruiting', subject: 'Interview with 3C World Group', body: 'Hi {{firstName}}, can you meet on {{date}}?', createdByName: 'Lab Owner', updatedAt: ago(200) },
        { id: 't3', name: 'Weekly check-in', category: 'performance', subject: 'Your week', body: 'Nice work this week.', createdByName: 'Lab Owner', updatedAt: null },
      ],
    };
  if (path.startsWith('/api/portal/training'))
    return {
      resources: [
        { id: 'r1', title: 'AT&T Fiber install walkthrough', description: 'What the tech does on install day.', type: 'video', category: 'att', url: '#', fileName: 'att-install.mp4', fileSize: 48_000_000, requiredRoles: [], isRequired: true, isPublished: true },
        { id: 'r2', title: 'T-Fiber price sheet', description: 'Current plans and promos.', type: 'document', category: 'tfiber', url: '#', fileName: 'tfiber-prices.pdf', fileSize: 420_000, requiredRoles: [], isRequired: false, isPublished: false },
        { id: 'r3', title: 'Verizon objection handling', description: 'Common objections at the door.', type: 'link', category: 'verizon_frontier', url: '#', requiredRoles: [], isRequired: false, isPublished: true },
      ],
    };
  if (path.startsWith('/api/portal/knowledge/questions'))
    return {
      questions: [
        { id: 'q1', repName: 'Dana Alvarez', question: 'When does T-Fiber pay out?', prevQuestion: null, hadPhoto: false, answer: 'Estimated payout windows are on your Pay tab.', draft: null, rating: 'up', createdAt: ago(4) },
        { id: 'q2', repName: 'Marcus Reed', question: 'And for upgrades?', prevQuestion: 'When does T-Fiber pay out?', hadPhoto: false, answer: 'Upgrades follow the same estimate window.', draft: 'Upgrades pay the same day.', rating: 'down', createdAt: ago(8) },
      ],
    };
  if (path.startsWith('/api/portal/knowledge/practice/assignments'))
    return {
      assignments: [
        { id: 'a1', repUid: null, repName: 'Every rep', persona: 'skeptic', personaLabel: 'The skeptic', count: 3, due: '2026-10-24', createdAt: ago(48), reps: [{ uid: 'u1', name: 'Dana Alvarez', done: 2 }, { uid: 'u2', name: 'Marcus Reed', done: 3 }] },
      ],
      reps: [{ uid: 'u1', name: 'Dana Alvarez' }, { uid: 'u2', name: 'Marcus Reed' }],
    };
  if (path.startsWith('/api/portal/knowledge/practice'))
    return {
      sessions: [
        { id: 's1', repName: 'Dana Alvarez', persona: 'skeptic', homeowner: 'Maria Garcia · Spectrum $91/mo', door: null, result: 'Set appointment', score: 78, skills: { opener: 80, discovery: 70, objections: 75, close: 85 }, delivery: null, redo: false, feedback: 'Strong close. Ask one more question before the price.', turns: [{ role: 'rep', text: 'Hi, I am with 3C.' }, { role: 'homeowner', text: 'Not interested.' }], corrections: [], createdAt: ago(6) },
      ],
    };
  if (path.startsWith('/api/portal/knowledge'))
    return {
      notes: [
        { id: 'n1', title: 'Pay timing', body: 'Pay is shown as estimates only.', order: 0, updatedAt: ago(30), updatedBy: 'Lab Owner' },
        { id: 'n2', title: 'Install windows', body: 'AT&T installs book 3 to 7 days out.', order: 1, updatedAt: ago(90), updatedBy: 'Lab Owner' },
      ],
    };
  if (path.startsWith('/api/portal/onboarding/review')) return { submissions: [{ userId: 'u1', submittedAt: ago(70) }, { userId: 'u2', submittedAt: ago(5) }] };
  if (path.startsWith('/api/portal/recruiting/invites'))
    return { invites: [{ status: 'submitted', submittedAt: ago(10) }], applications: [{ status: 'applied', createdAt: ago(1) }, { status: 'applied', createdAt: ago(20) }] };
  if (path.startsWith('/api/portal/pipeline')) return { counts: { processing: 3, need_logins: 1, cleared_to_sell: 2 } };
  if (path.startsWith('/api/portal/admin/employee-import'))
    return {
      sheetRows: 40,
      matched: 3,
      unmatchedRows: 37,
      skipped: [{ name: 'Pat Doe', reason: 'Two portal users share this name' }],
      people: [
        { name: 'Dana Alvarez', willFill: ['phone', 'shirt'], keptExisting: ['address'], issues: [] },
        { name: 'Marcus Reed', willFill: [], keptExisting: ['phone'], issues: ['SSN has 8 digits'] },
      ],
    };
  return null;
}

if (typeof window !== 'undefined' && !(window as { __p7Mock?: boolean }).__p7Mock) {
  (window as { __p7Mock?: boolean }).__p7Mock = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/')) return real(input, init);
    await new Promise((r) => setTimeout(r, 150));
    const body = answer(url, init);
    if (body === null) return new Response(JSON.stringify({ error: 'Not in the lab' }), { status: 500 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

function Harness() {
  const page = useSearchParams().get('page') ?? 'settings';
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          {page === 'requests' ? (
            <RequestsPage />
          ) : page === 'ops' ? (
            <OpsQueuesPanel title="Needs attention" />
          ) : (
            <SettingsPage />
          )}
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <AuthSubjectProvider user={OWNER}>
        <Suspense fallback={null}>
          <Harness />
        </Suspense>
      </AuthSubjectProvider>
    </AuthProvider>
  );
}
