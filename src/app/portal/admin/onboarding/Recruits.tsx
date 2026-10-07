'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import { RECRUITING_ROLES } from '@/components/portal/admin-d/adminHubs';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { ApplicationRecord } from '@/types';
import { Invites, type InviteView } from './Invites';

// Hiring → Recruits: one list of everyone being recruited (website
// applications and invites, one row per person), with "Send an invite" and a
// search box on top. One load of the recruiting API feeds it, and every action
// reloads it, so an invited applicant moves on right away. ?application=<id>
// opens the invite form filled from that application (from anywhere in the
// portal).

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
      <AdminPageHead title="Recruits" />
      <Invites
        invites={invites}
        applications={applications}
        loading={loading}
        loadFailed={loadFailed}
        reload={load}
        onChanged={onChanged}
      />
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
