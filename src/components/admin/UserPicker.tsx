'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { RoleDisplayNames, getEffectiveRole, type UserRole } from '@/types';
import type { FieldRole, PlatformRole } from '@/types';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import p from './user-picker.module.css';

/** One person from GET /api/portal/auth/users, as the picker needs them. */
export interface PickerUser {
  uid: string;
  displayName?: string;
  email?: string;
  role?: PlatformRole;
  fieldRole?: FieldRole;
  status?: string;
}

/** The name a picker shows for a person. */
export function pickerName(user: Pick<PickerUser, 'uid' | 'displayName' | 'email'>): string {
  return user.displayName || user.email || user.uid;
}

/** A role's display name, or the raw value for a retired one. */
export const roleLabel = (role?: string) => (role && RoleDisplayNames[role as UserRole]) || role || '—';

/**
 * Everyone in the portal directory (GET /api/portal/auth/users, management
 * only), loaded once `enabled` is true. Fail-soft: a failed load leaves the
 * list empty, so a picker just shows no results. `loaded` turns true either way.
 */
export function usePickerUsers(enabled: boolean): { users: PickerUser[]; loaded: boolean } {
  const [state, setState] = useState<{ users: PickerUser[]; loaded: boolean }>({ users: [], loaded: false });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/portal/auth/users', { headers: { Authorization: `Bearer ${token ?? ''}` } });
        const data = await res.json();
        if (!active) return;
        setState({ users: res.ok ? ((data.users || []) as PickerUser[]) : [], loaded: true });
      } catch {
        if (active) setState({ users: [], loaded: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

/**
 * Name search over a list of people: type to filter, tap to pick. Candidates
 * show only while picking; at rest the box shows the picked person (`value`,
 * named by `valueLabel`), or `emptyText`. Pass `onClear` to offer a clear row
 * while someone is picked. For an "add a person" picker leave `value` empty:
 * the box clears after each pick.
 */
export function UserPicker({
  id,
  candidates,
  value = '',
  valueLabel = '',
  onPick,
  onClear,
  clearLabel = 'Clear',
  placeholder,
  listLabel,
  emptyText,
  limit = 8,
}: {
  /** The input's id, for the caller's <label htmlFor>. */
  id: string;
  /** Who can be picked, already filtered by the caller. */
  candidates: PickerUser[];
  value?: string;
  valueLabel?: string;
  onPick: (user: PickerUser) => void;
  onClear?: () => void;
  clearLabel?: string;
  placeholder: string;
  /** The result list's accessible name. */
  listLabel: string;
  /** Shown under the box at rest when nobody is picked. */
  emptyText?: string;
  limit?: number;
}) {
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  // Typing clears the picked name from the box until the next pick.
  const [labelCleared, setLabelCleared] = useState(false);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, limit);
    return candidates.filter((c) => (c.displayName || c.email || '').toLowerCase().includes(q)).slice(0, limit);
  }, [candidates, search, limit]);

  const showClear = Boolean(onClear && value);

  return (
    <>
      <label className={`${u.search} ${p.search}`}>
        <Search size={18} aria-hidden="true" />
        <input
          id={id}
          className={u.input}
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          value={search || (labelCleared ? '' : valueLabel)}
          onFocus={() => setPicking(true)}
          onChange={(e) => {
            setPicking(true);
            setLabelCleared(true);
            setSearch(e.target.value);
          }}
        />
      </label>
      {!value && !picking && emptyText ? <p className={u.personSub}>{emptyText}</p> : null}
      {(picking && results.length) || showClear ? (
        <ul className={p.list} aria-label={listLabel}>
          {(picking ? results : []).map((m) => {
            const selected = value === m.uid;
            return (
              <li key={m.uid}>
                <button
                  type="button"
                  className={p.option}
                  aria-pressed={selected}
                  onClick={() => {
                    onPick(m);
                    setLabelCleared(false);
                    setSearch('');
                    setPicking(false);
                  }}
                >
                  <span className={u.personText}>
                    <span className={u.personName}>
                      <span>{m.displayName || m.email || 'Unnamed'}</span>
                    </span>
                    <span className={u.personSub}>{roleLabel(getEffectiveRole(m))}</span>
                  </span>
                  {selected ? <Check size={18} className={p.check} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
          {showClear ? (
            <li>
              <button
                type="button"
                className={`${p.option} ${p.clear}`}
                onClick={() => {
                  onClear?.();
                  setLabelCleared(false);
                  setPicking(false);
                }}
              >
                <X size={18} aria-hidden="true" />
                {clearLabel}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}
