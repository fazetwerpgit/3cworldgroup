'use client';

import type { ReactNode } from 'react';
import { AuthProvider, AuthSubjectProvider } from '@/contexts/AuthContext';
import { COMP_PLAN_ROLES, FIBER_COMPANIES, FIBER_PLANS, type User } from '@/types';
import s from '@/components/portal/rep/rep.module.css';

// Dev-only harness for taste pass Package P2 (Learn, Ask, Calls). No login,
// no network: the real screens render under a stand-in user, and every
// /api/portal call is answered here in the browser with sample data.

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};

const MODULES = [
  { id: 'm1', title: 'Door approach basics', description: 'How to open at the door in the first ten seconds, and what to say when they ask who you are with.', type: 'video', category: 'general', url: '', duration: 8, isRequired: true },
  { id: 'm2', title: 'TFiber plan lineup', description: 'The current TFiber plans and how to explain them.', type: 'document', category: 'tfiber', url: 'https://example.com/doc.pdf', duration: 5, isRequired: false },
  { id: 'm3', title: 'Handling the price objection', description: '', type: 'quiz', category: 'general', url: 'https://example.com/quiz', duration: 6, isRequired: true },
  { id: 'm4', title: 'AT&T Fiber order walkthrough', description: '', type: 'link', category: 'att', url: 'https://example.com', duration: 12, isRequired: false },
  { id: 'm5', title: 'Frontier install day', description: '', type: 'video', category: 'frontier', url: 'https://example.com', duration: 4, isRequired: false },
];

function rates() {
  const out: Record<string, Record<string, Record<string, number>>> = {};
  COMP_PLAN_ROLES.forEach((role, i) => {
    out[role] = {};
    FIBER_COMPANIES.forEach((company) => {
      out[role][company.value] = {};
      FIBER_PLANS.filter((p) => p.company === company.value).forEach((plan, j) => {
        out[role][company.value][plan.id] = [100, 150, 0, 200, 125][(i + j) % 5];
      });
    });
  });
  return out;
}

function margin() {
  const out: Record<string, Record<string, number>> = {};
  FIBER_COMPANIES.forEach((company) => {
    out[company.value] = {};
    FIBER_PLANS.filter((p) => p.company === company.value).forEach((plan, j) => {
      out[company.value][plan.id] = [50, 75, 60][j % 3];
    });
  });
  return out;
}

function reply(path: string, method: string, owner: boolean, emptyCalls: boolean): unknown {
  if (path.startsWith('/api/portal/commission')) {
    return owner
      ? {
          scope: 'all',
          updatedAt: '2026-10-01T12:00:00Z',
          updatedByName: 'Sample Owner',
          tiers: [
            { fieldRole: 'entry_rep', baseRate: 10 },
            { fieldRole: 'l1_manager', baseRate: 12, overrideRate: 2 },
            { fieldRole: 'l2_manager', baseRate: 14, overrideRate: 3 },
            { fieldRole: 'general_manager', baseRate: 15, overrideRate: 4 },
            { fieldRole: 'office_manager', baseRate: 15, overrideRate: 2 },
            { fieldRole: 'director', baseRate: 18 },
          ],
        }
      : { scope: 'own', updatedAt: '2026-10-01T12:00:00Z', updatedByName: null, tiers: [{ fieldRole: 'entry_rep', baseRate: 10 }] };
  }
  if (path.startsWith('/api/portal/comp-plan')) {
    return { rates: rates(), margin: margin(), version: 'Sample', updatedAt: '2026-10-01T12:00:00Z', updatedByName: 'Sample Owner' };
  }
  if (path.startsWith('/api/portal/training/progress')) {
    return { progress: { m2: { completed: true, progress: 100 }, m4: { completed: false, progress: 40 } } };
  }
  const one = path.match(/^\/api\/portal\/training\/([^/?]+)/);
  if (one) return { resource: MODULES.find((m) => m.id === one[1]) ?? MODULES[0] };
  if (path.startsWith('/api/portal/training')) return { resources: MODULES };
  if (path.startsWith('/api/portal/calls')) {
    if (emptyCalls) return { calls: [], canManage: owner };
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' }).toLowerCase();
    return {
      canManage: owner,
      calls: [
        { id: 'c1', title: 'Morning huddle', description: 'Goals for the day and any install issues.', day: today, time: '09:00', timezone: 'America/Chicago', meetLink: 'https://meet.google.com/x', audience: 'all', active: true },
        { id: 'c2', title: 'Managers sync', description: '', day: today, time: '23:30', timezone: 'America/Chicago', meetLink: 'https://meet.google.com/x', audience: 'managers', active: true },
        { id: 'c3', title: 'Friday team call', description: 'Wins of the week and the leaderboard.', day: 'friday', time: '10:00', timezone: 'America/Chicago', meetLink: 'https://meet.google.com/x', audience: 'all', active: true },
        { id: 'c4', title: 'Training call', description: 'Objection practice.', day: 'tuesday', time: '18:00', timezone: 'America/Chicago', meetLink: 'https://meet.google.com/x', audience: 'all', active: true },
      ],
    };
  }
  if (path.startsWith('/api/portal/ask/practice/mine')) {
    return {
      assignments: [{ id: 'a1', persona: 'Skeptic', count: 3, done: 1, due: day(3) }],
      sessions: [
        { id: 's1', persona: 'Price shopper', result: 'Sold', score: 7, skills: { opener: 7, discovery: 6, objections: 8, close: 7 }, delivery: null, redo: false, feedback: 'What worked\nGood opener.\nTry this line\n"Most of your neighbors switched for the price lock."', createdAt: new Date().toISOString() },
        { id: 's2', persona: 'Skeptic', result: null, score: 5, skills: { opener: 5, discovery: 4, objections: 6, close: 5 }, delivery: null, redo: false, feedback: 'Fix next time\n- Ask a question before pitching.', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
      ],
    };
  }
  if (path.startsWith('/api/portal/ask') && method === 'POST') {
    return { id: 't1', answer: 'Call Fiber Support at 1-800-555-0100.\n\nIf the install was missed, open an EscaLink ticket: https://example.com' };
  }
  return {};
}

let installed = false;

function installFetch(owner: boolean, emptyCalls: boolean) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
    if (!path.startsWith('/api/portal/')) return real(input, init);
    await new Promise((r) => setTimeout(r, 150));
    const body = reply(path, (init?.method ?? 'GET').toUpperCase(), owner, emptyCalls);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

export function P2Harness({ owner, emptyCalls = false, children }: { owner: boolean; emptyCalls?: boolean; children: ReactNode }) {
  installFetch(owner, emptyCalls);
  const user = {
    uid: 'sample-user',
    email: 'sample@example.com',
    displayName: 'Jordan Reyes',
    role: owner ? 'owner' : 'entry_rep',
    fieldRole: owner ? undefined : 'entry_rep',
    status: 'active',
  } as unknown as User;
  return (
    <AuthProvider>
      <AuthSubjectProvider user={user}>
        <div className={s.root} data-shell="rep">
          <main className={s.scroller} id="rep-main">
            <div className={s.main}>{children}</div>
          </main>
        </div>
      </AuthSubjectProvider>
    </AuthProvider>
  );
}
