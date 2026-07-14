'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole, RoleDisplayNames, getEffectiveRole, isPlatformRole } from '@/types';
import type { FieldRole, PlatformRole } from '@/types';

interface UserFormProps {
  user?: User;
  isEdit?: boolean;
}

// Full real assignable role set from HEAD's RoleDisplayNames — every
// PlatformRole and FieldRole, not a drafted-down subset. Order runs
// field-rep tiers up through platform roles; labels come from the single
// source of truth so this list can't drift from what the rest of the app calls each role.
const ALL_ROLE_VALUES: UserRole[] = [
  'entry_rep',
  'entry_level_rep',
  'gm_in_training',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'office_manager',
  'general_manager',
  'operations',
  'admin',
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

const MANAGER_ELIGIBLE: UserRole[] = ['l1_manager', 'l2_manager', 'operations', 'admin'];

interface ManagerCandidate {
  uid: string;
  displayName?: string;
  email?: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
}

const roleLabel = (role?: string) =>
  roleSegments.find((r) => r.value === role)?.label || role || '—';

export function UserForm({ user, isEdit = false }: UserFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const [formData, setFormData] = useState({
    email: user?.email || '',
    password: '',
    displayName: user?.displayName || '',
    // Default for admin-created users stays entry_rep (Account Executive), as
    // before the redesign — entry_level_rep is the onboarding-gated signup role.
    role: getEffectiveRole(user) || ('entry_rep' as UserRole),
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    zip: user?.zip || '',
    managerId: user?.reportsToId || '',
    status: (user?.status || 'active') as 'pending' | 'active' | 'inactive',
  });

  const [managerSearch, setManagerSearch] = useState('');
  const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([]);
  const [selectedManagerLabel, setSelectedManagerLabel] = useState('');

  // Real name-search picker, backed by the EXISTING GET /api/portal/auth/users
  // endpoint — no new route. Filtered client-side to manager-eligible roles.
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/portal/auth/users?requestedBy=${currentUser.uid}`);
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
    const pool = managerCandidates.filter((c) => c.uid !== user?.uid);
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((c) => (c.displayName || c.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [managerCandidates, managerSearch, user?.uid]);

  const handleChange = (name: string, value: string, markDirty = true) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (markDirty) setDirty(true);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const assignedFieldRole = isPlatformRole(formData.role)
        ? undefined
        : (formData.role as FieldRole);
      const rolePayload = assignedFieldRole
        ? { fieldRole: assignedFieldRole }
        : { role: formData.role };

      if (isEdit && user) {
        const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedBy: currentUser?.uid,
            displayName: formData.displayName,
            ...rolePayload,
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
      } else {
        if (!formData.password) throw new Error('Password is required for new users');

        const response = await fetch('/api/portal/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedBy: currentUser?.uid,
            email: formData.email,
            password: formData.password,
            displayName: formData.displayName,
            ...rolePayload,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
            managerId: formData.managerId || null,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create user');
      }

      router.push('/portal/admin/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div
          className="admin-line-empty-state"
          style={{ display: 'block', marginTop: 0, borderColor: 'var(--admin-line-red)', color: 'var(--admin-line-red)' }}
        >
          {error}
        </div>
      )}

      <div className="admin-line-panel-head" style={{ marginTop: error ? 14 : 0 }}>
        <div>
          <div className="admin-line-eyebrow">01 / account</div>
          <h2>Who they are.</h2>
          <p className="admin-line-sub">
            Identity fields are editable; the email stays locked to the account.
          </p>
        </div>
        {isEdit && <span className="admin-line-meta">last saved / today</span>}
      </div>

      <div className="admin-line-form-grid" style={{ marginTop: 14 }}>
        <div className="admin-line-field">
          <label htmlFor="person-name">Name</label>
          <input
            id="person-name"
            value={formData.displayName}
            onChange={(e) => handleChange('displayName', e.target.value)}
            required
            placeholder="John Smith"
          />
        </div>
        <div className="admin-line-field">
          <label htmlFor="person-phone">Phone</label>
          <input
            id="person-phone"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
        <div className="admin-line-field">
          <label htmlFor="person-email">
            Email <Lock className="admin-line-lock" />
          </label>
          <input
            id="person-email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value, false)}
            readOnly={isEdit}
            disabled={isEdit}
            required
            placeholder="employee@3cworldgroup.com"
          />
        </div>
        {isEdit && (
          <div className="admin-line-field">
            <label htmlFor="person-hire">Hire date</label>
            <input
              id="person-hire"
              readOnly
              disabled
              value={
                user?.hireDate
                  ? new Date(user.hireDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A'
              }
            />
          </div>
        )}
        <div className="admin-line-field full">
          <label htmlFor="person-address">Address</label>
          <input
            id="person-address"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="123 Main St"
          />
        </div>
      </div>

      {!isEdit && (
        <div className="admin-line-new-note" style={{ marginTop: 15 }}>
          Creating new — set a temporary password below. Same form, new record.
          <div className="admin-line-field" style={{ marginTop: 10 }}>
            <label htmlFor="new-password">Temporary password / New User only</label>
            <input
              id="new-password"
              type="password"
              minLength={6}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              required
              placeholder="Minimum 6 characters"
            />
          </div>
        </div>
      )}

      <div className="admin-line-form-section">
        <div className="admin-line-eyebrow">02 / role &amp; status</div>
        <h3>Place them on the line.</h3>
        <div className="admin-line-field" style={{ marginTop: 12 }}>
          <label>Role / choose one</label>
          <div className="admin-line-segmented" role="group" aria-label="Role">
            {roleSegments.map((seg) => (
              <button
                key={seg.value}
                type="button"
                aria-pressed={formData.role === seg.value}
                onClick={() => handleChange('role', seg.value, false)}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>

        {isEdit && (
          <div className="admin-line-field" style={{ marginTop: 12 }}>
            <label>Status / choose one</label>
            <div className="admin-line-segmented" role="group" aria-label="Status">
              {statusSegments.map((seg) => (
                <button
                  key={seg.value}
                  type="button"
                  aria-pressed={formData.status === seg.value}
                  onClick={() => handleChange('status', seg.value, false)}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="admin-line-field admin-line-manager-picker" style={{ marginTop: 12 }}>
          <label htmlFor="manager-search">Manager / named person picker</label>
          <input
            id="manager-search"
            type="search"
            placeholder="Search managers"
            value={managerSearch || selectedManagerLabel}
            onChange={(e) => {
              setSelectedManagerLabel('');
              setManagerSearch(e.target.value);
            }}
          />
          <div className="admin-line-manager-results">
            {managerResults.map((m) => (
              <button
                key={m.uid}
                type="button"
                onClick={() => {
                  handleChange('managerId', m.uid);
                  setSelectedManagerLabel(m.displayName || m.email || m.uid);
                  setManagerSearch('');
                }}
              >
                {m.displayName || m.email || 'Unnamed'} · {roleLabel(getEffectiveRole(m))}
              </button>
            ))}
            {formData.managerId && (
              <button type="button" onClick={() => { handleChange('managerId', ''); setSelectedManagerLabel(''); }}>
                Clear manager
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="admin-line-save-bar" style={{ display: dirty || saved ? 'flex' : 'none' }}>
        <span>
          {saved
            ? `${formData.displayName || 'Record'} saved · Saved`
            : `Unsaved changes in ${formData.displayName || 'this'}'s record.`}
        </span>
        <div className="admin-line-save-actions">
          <button
            type="button"
            className="admin-line-clear-button"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-line-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </div>

      {!isEdit && (
        <div style={{ marginTop: 15 }}>
          <button type="button" className="admin-line-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Create user'}
          </button>
        </div>
      )}
    </>
  );
}
