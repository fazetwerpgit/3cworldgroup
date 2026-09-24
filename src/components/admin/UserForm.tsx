'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Lock, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import f from './user-form.module.css';
import {
  User,
  UserRole,
  RoleDisplayNames,
  getEffectiveRole,
  isAdminLevel,
  isOwner,
  isPlatformRole,
  graduatedFieldRole,
} from '@/types';
import type { FieldRole, PlatformRole } from '@/types';

interface UserFormProps {
  user: User;
}

// The user-management routes verify the caller from the ID token and check
// management/admin role against it. The [id] in the URL and managerId in the
// body are TARGETS — who is being edited, and who they report to.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

async function readJsonIfPresent(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) {
    return {};
  }
  return response.json().catch(() => ({}));
}

// Assignable roles only: the retired tiers (IBO levels, L1/L2 manager) are
// deliberately absent — users still holding them keep working, but nobody new
// is placed on them. Order runs field-rep tiers up through platform roles;
// labels come from RoleDisplayNames so this list can't drift from what the
// rest of the app calls each role.
const ALL_ROLE_VALUES: UserRole[] = [
  'entry_rep',
  'entry_level_rep',
  'ae_tier_1',
  'ae_tier_2',
  'internal_rep',
  'gm_in_training',
  'office_manager',
  'general_manager',
  'regional_manager',
  'director',
  'operations',
  'admin',
  'owner',
];

const roleSegments: { value: UserRole; label: string }[] = ALL_ROLE_VALUES.map((value) => ({
  value,
  label: RoleDisplayNames[value],
}));

const statusSegments: { value: 'pending' | 'active' | 'inactive'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const MANAGER_ELIGIBLE: UserRole[] = [
  'l1_manager',
  'l2_manager',
  'regional_manager',
  'director',
  'operations',
  'admin',
  'owner',
];

interface ManagerCandidate {
  uid: string;
  displayName?: string;
  email?: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
}

const roleLabel = (role?: string) =>
  (role && RoleDisplayNames[role as UserRole]) || role || '—';

export function UserForm({ user }: UserFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  // The role the record was loaded with. On edit, a role is only sent when the
  // admin changes it: assigning a field role to a pending user starts their
  // onboarding (checklist email + e-sign envelopes), so a name-only save must
  // never re-send or default one.
  const [loadedRole, setLoadedRole] = useState<UserRole | ''>(getEffectiveRole(user) ?? '');

  const [formData, setFormData] = useState({
    email: user.email || '',
    displayName: user.displayName || '',
    // A user with no role (a pending signup) gets NO default: the admin must
    // pick one from the empty "Select a role" option.
    role: (getEffectiveRole(user) ?? '') as UserRole | '',
    phone: user.phone || '',
    address: user.address || '',
    city: user.city || '',
    state: user.state || '',
    zip: user.zip || '',
    managerId: user.reportsToId || '',
    status: (user.status || 'active') as 'pending' | 'active' | 'inactive',
  });

  const [managerSearch, setManagerSearch] = useState('');
  const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([]);
  const [selectedManagerLabel, setSelectedManagerLabel] = useState('');
  // Candidates show only while picking; at rest the list looked like the
  // user's assigned managers (Jacob 9/23: "Braeden and Jeremy are under my
  // managers" when none was set).
  const [pickingManager, setPickingManager] = useState(false);

  // Real name-search picker, backed by the EXISTING GET /api/portal/auth/users
  // endpoint — no new route. Filtered client-side to manager-eligible roles.
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/portal/auth/users', { headers: await authHeaders() });
        const data = await res.json();
        if (!active || !res.ok) return;
        // L1/L2 managers are stored under fieldRole, not role — check the
        // effective role (role ?? fieldRole) so they aren't silently excluded.
        const eligible = ((data.users || []) as ManagerCandidate[]).filter((u) =>
          MANAGER_ELIGIBLE.includes(getEffectiveRole(u) as UserRole)
        );
        setManagerCandidates(eligible);
        const current = eligible.find((u) => u.uid === formData.managerId);
        if (current) {
          setSelectedManagerLabel(current.displayName || current.email || current.uid);
        }
      } catch {
        // fail-soft: picker just shows no results
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const managerResults = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();
    const pool = managerCandidates.filter((c) => c.uid !== user.uid);
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((c) => (c.displayName || c.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [managerCandidates, managerSearch, user.uid]);

  const handleChange = (name: string, value: string, markDirty = true) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (markDirty) setDirty(true);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const assignedFieldRole = !formData.role || isPlatformRole(formData.role)
        ? undefined
        : (formData.role as FieldRole);
      const rolePayload = !formData.role
        ? {}
        : assignedFieldRole
          ? { fieldRole: assignedFieldRole }
          : { role: formData.role };
      const roleChanged = !!formData.role && formData.role !== loadedRole;

      const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({
          displayName: formData.displayName,
          ...(roleChanged ? rolePayload : {}),
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          managerId: formData.managerId || null,
          ...(formData.status !== user.status ? { status: formData.status } : {}),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to update user');
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);

      router.push('/portal/admin/people?tab=everyone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: 'active' | 'inactive') => {
    if (actionBusy) return;
    if (status === 'inactive' && !window.confirm(`Deactivate ${user.displayName || user.email || 'this user'}?`)) return;
    setActionBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ status }),
      });
      const data = await readJsonIfPresent(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to update user status');
      setFormData((prev) => ({ ...prev, status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setActionBusy(false);
    }
  };

  const deleteUser = async () => {
    if (actionBusy) return;
    if (!window.confirm(`Delete ${user.displayName || user.email || 'this user'}? This cannot be undone.`)) return;
    setActionBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const data = await readJsonIfPresent(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to delete user');
      router.push('/portal/admin/people?tab=everyone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
      setActionBusy(false);
    }
  };

  const acceptPending = async () => {
    if (!user.fieldRole || actionBusy) return;
    if (!window.confirm(`Accept and activate ${user.displayName || user.email || 'this user'}?`)) return;
    setActionBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ status: 'active', fieldRole: graduatedFieldRole(user.fieldRole) }),
      });
      const data = await readJsonIfPresent(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to accept user');
      setFormData((prev) => ({ ...prev, status: 'active', role: graduatedFieldRole(user.fieldRole!) }));
      setLoadedRole(graduatedFieldRole(user.fieldRole));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept user');
    } finally {
      setActionBusy(false);
    }
  };

  const selectableRoles = roleSegments.filter((seg) =>
    seg.value === 'owner'
      ? isOwner(currentUser?.role)
      : isAdminLevel(currentUser?.role) || !isPlatformRole(seg.value)
  );
  const personName = formData.displayName || 'this person';
  const showSaveBar = dirty || saved;

  return (
    <div className={f.form}>
      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}

      <section className={s.panel} aria-labelledby="person-details-heading">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="person-details-heading" className={s.kicker}>
            Account details
          </h2>
          <span className={u.panelMeta}>Email is locked</span>
        </div>
        <div className={`${u.panelBody} ${u.formGrid} ${u.formGrid2}`}>
          <div className={u.field}>
            <label className={u.label} htmlFor="person-name">
              Name
            </label>
            <input
              id="person-name"
              className={u.input}
              value={formData.displayName}
              onChange={(e) => handleChange('displayName', e.target.value)}
              required
              autoComplete="off"
              placeholder="John Smith"
            />
          </div>
          <div className={u.field}>
            <label className={u.label} htmlFor="person-phone">
              Phone
            </label>
            <input
              id="person-phone"
              className={u.input}
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className={u.field}>
            <label className={u.label} htmlFor="person-email">
              Email <Lock size={14} aria-label="Locked" />
            </label>
            <input
              id="person-email"
              className={u.input}
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value, false)}
              readOnly
              disabled
            />
          </div>
          <div className={u.field}>
            <label className={u.label} htmlFor="person-hire">
              Hire date <Lock size={14} aria-label="Locked" />
            </label>
            <input
              id="person-hire"
              className={u.input}
              readOnly
              disabled
              value={
                user.hireDate
                  ? new Date(user.hireDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A'
              }
            />
          </div>
          <div className={`${u.field} ${u.wide}`}>
            <label className={u.label} htmlFor="person-address">
              Address
            </label>
            <input
              id="person-address"
              className={u.input}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className={u.field}>
            <label className={u.label} htmlFor="person-shirt">
              Shirt size <Lock size={14} aria-label="Locked" />
            </label>
            <input id="person-shirt" className={u.input} readOnly disabled value={user.shirtSize || 'Not set'} />
          </div>
        </div>
      </section>

      <section className={s.panel} aria-labelledby="person-role-heading">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="person-role-heading" className={s.kicker}>
            Role and status
          </h2>
        </div>
        <div className={`${u.panelBody} ${u.formGrid}`}>
          <div className={`${u.formGrid} ${u.formGrid2}`}>
            <div className={u.field}>
              <label className={u.label} htmlFor="person-role">
                Role
              </label>
              {/* Platform roles are admin-grantable only, and Owner is
                  owner-grantable only — the server enforces both; hiding them here
                  keeps the UI from offering choices that would 403. A retired role
                  the user still holds (IBO level, L1/L2 manager) is shown as a
                  disabled option so the dropdown reflects reality until they are
                  moved to a current role. */}
              <span className={u.selectWrap}>
                <select
                  id="person-role"
                  className={u.input}
                  value={formData.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                >
                  {!formData.role && (
                    <option value="" disabled>
                      Select a role
                    </option>
                  )}
                  {formData.role && !ALL_ROLE_VALUES.includes(formData.role) && (
                    <option value={formData.role} disabled>
                      {roleLabel(formData.role)} (retired)
                    </option>
                  )}
                  {selectableRoles.map((seg) => (
                    <option key={seg.value} value={seg.value}>
                      {seg.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </div>

            <div className={u.field}>
              <span className={u.label} id="person-status-label">
                Status
              </span>
              <div className={u.segmented} role="group" aria-labelledby="person-status-label">
                {statusSegments.map((seg) => (
                  <button
                    key={seg.value}
                    type="button"
                    aria-pressed={formData.status === seg.value}
                    onClick={() => handleChange('status', seg.value)}
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={u.field}>
            <label className={u.label} htmlFor="manager-search">
              Manager
            </label>
            <label className={`${u.search} ${f.managerSearch}`}>
              <Search size={18} aria-hidden="true" />
              <input
                id="manager-search"
                className={u.input}
                type="search"
                placeholder="Search managers"
                autoComplete="off"
                value={managerSearch || selectedManagerLabel}
                onFocus={() => setPickingManager(true)}
                onChange={(e) => {
                  setPickingManager(true);
                  setSelectedManagerLabel('');
                  setManagerSearch(e.target.value);
                }}
              />
            </label>
            {!formData.managerId && !pickingManager ? <p className={u.personSub}>No manager</p> : null}
            {(pickingManager && managerResults.length) || formData.managerId ? (
              <ul className={f.managerList} aria-label="Managers">
                {(pickingManager ? managerResults : []).map((m) => {
                  const selected = formData.managerId === m.uid;
                  return (
                    <li key={m.uid}>
                      <button
                        type="button"
                        className={f.managerOption}
                        aria-pressed={selected}
                        onClick={() => {
                          handleChange('managerId', m.uid);
                          setSelectedManagerLabel(m.displayName || m.email || m.uid);
                          setManagerSearch('');
                          setPickingManager(false);
                        }}
                      >
                        <span className={u.personText}>
                          <span className={u.personName}>
                            <span>{m.displayName || m.email || 'Unnamed'}</span>
                          </span>
                          <span className={u.personSub}>{roleLabel(getEffectiveRole(m))}</span>
                        </span>
                        {selected ? <Check size={18} className={f.managerCheck} aria-hidden="true" /> : null}
                      </button>
                    </li>
                  );
                })}
                {formData.managerId ? (
                  <li>
                    <button
                      type="button"
                      className={`${f.managerOption} ${f.managerClear}`}
                      onClick={() => {
                        handleChange('managerId', '');
                        setSelectedManagerLabel('');
                        setPickingManager(false);
                      }}
                    >
                      <X size={18} aria-hidden="true" />
                      Clear manager
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`${s.panel} ${f.actions}`} aria-labelledby="person-actions-heading">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="person-actions-heading" className={s.kicker}>
            Account actions
          </h2>
        </div>
        <div className={`${u.panelBody} ${f.actionsBody}`}>
          <div className={u.btnRow}>
            {formData.status === 'pending' && user.fieldRole ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                onClick={() => void acceptPending()}
                disabled={actionBusy}
              >
                {actionBusy ? 'Working…' : 'Accept'}
              </button>
            ) : null}
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm}`}
              onClick={() => void updateStatus(formData.status === 'inactive' ? 'active' : 'inactive')}
              disabled={actionBusy}
            >
              {actionBusy ? 'Working…' : formData.status === 'inactive' ? 'Activate' : 'Deactivate'}
            </button>
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
              onClick={() => void deleteUser()}
              disabled={actionBusy}
            >
              Delete
            </button>
          </div>
        </div>
      </section>

      {/* Sticky, not fixed: it rides the bottom of the scroller while the form is
          in view and settles under it at the end, so nothing is ever covered and
          no position:fixed lives inside the phone scroller. */}
      {showSaveBar ? (
        <div className={f.saveBar} role="status">
          <span className={f.saveText}>
            {saved ? (
              <>
                <Check size={18} className={f.savedIcon} aria-hidden="true" />
                {personName} saved
              </>
            ) : (
              <>Unsaved changes to {personName}</>
            )}
          </span>
          <div className={f.saveActions}>
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm}`}
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${s.btnPrimary} ${u.primarySm}`}
              onClick={handleSubmit}
              disabled={loading || saved}
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
