'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import { RECRUITING_ROLES } from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { ApplicationRecord } from '@/types';
import { Applicants } from './Applicants';
import { Invites, type InviteView } from './Invites';

// Hiring → Recruits: the invite form, the invites already sent and the website
// applications on one tab. One load of the recruiting API feeds both, so an
// invite sent from an application moves that applicant out of New right away.
// An applicant's Invite button sets ?application=<id>; Invites fills its form
// from it (the same link works from anywhere in the portal).

function RecruitsBody({ onChanged }: { onChanged?: () => void }) {
  const { user, hasPermission, isRole } = useAuth();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const canAccess =
    hasPermission('recruiting:read') ||
    isRole(
      'admin',
      'operations',
      'l1_manager',
      'l2_manager',
      'ibo_level_1',
      'ibo_level_2',
      'ibo_level_3',
      'ibo_level_4',
      'regional_manager',
      'director'
    );

  // The recruiting route verifies the caller from the ID token: the acting
  // identity is never sent in the query string or body.
  const load = useCallback(async () => {
    if (!user || !canAccess) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/recruiting/invites', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting data');
      setInvites(json.invites);
      setApplications(json.applications);
      setLoadFailed(false);
    } catch {
      // Load failures render in place (AdminFailed); action errors are Invites' notices.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canAccess, user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={u.page}>
      <AdminPageHead
        title="Recruits"
        actions={
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={load} disabled={loading}>
            <RotateCw size={16} className={loading ? u.spin : undefined} aria-hidden="true" />
            Refresh
          </button>
        }
      />
      <Invites
        invites={invites}
        applications={applications}
        loading={loading}
        loadFailed={loadFailed}
        reload={load}
        onChanged={onChanged}
      />
      <Applicants applications={applications} loading={loading} loadFailed={loadFailed} reload={load} />
    </div>
  );
}

/** `onChanged` runs after each action that changes the recruits, so the hub's tab counts follow. */
export function Recruits({ onChanged }: { onChanged?: () => void }) {
  return (
    <AdminGate roles={RECRUITING_ROLES}>
      <RecruitsBody onChanged={onChanged} />
    </AdminGate>
  );
}
