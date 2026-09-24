'use client';

import { useEffect, useState } from 'react';

// The invite link a hire opened on this device, so Sign in / Sign up can send
// them back to it instead of asking for the team code they were never given.
const STORAGE_KEY = 'portal-invite-token';
// Invites carry their own expiry; this covers one that somehow has none
// (same 14 days getInviteExpiration defaults to).
const FALLBACK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type InviteSignupState = 'open' | 'submitted';

interface StoredInvite {
  token: string;
  expiresAt: number;
}

export function rememberInvite(token: string, expiresAt: string | null) {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  const stored: StoredInvite = {
    token,
    expiresAt: Number.isFinite(parsed) ? parsed : Date.now() + FALLBACK_TTL_MS,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode / storage full: the invite link still works on its own.
  }
}

/** Drops the remembered invite; with a token, only if it is that one. */
export function forgetInvite(token?: string) {
  try {
    if (token && readRememberedInvite() !== token) return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function readRememberedInvite(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredInvite>;
    if (typeof stored.token !== 'string' || typeof stored.expiresAt !== 'number' || stored.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored.token;
  } catch {
    return null;
  }
}

/**
 * The invite this visitor holds — `?invite=<token>` when `fromUrl`, else the
 * one remembered on this device — once the server confirms it is still good.
 * A remembered invite the server turns down is forgotten.
 */
export function useSignupInvite({ fromUrl = false } = {}) {
  const [invite, setInvite] = useState<{ token: string; state: InviteSignupState } | null>(null);

  useEffect(() => {
    const urlToken = fromUrl ? new URLSearchParams(window.location.search).get('invite') : null;
    const token = urlToken || readRememberedInvite();
    if (!token) return;
    let cancelled = false;
    fetch('/api/portal/auth/team-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken: token }),
    })
      .then((response) => response.json() as Promise<{ ok?: unknown; state?: unknown }>)
      .then((result) => {
        if (cancelled) return;
        if (result.ok === true && (result.state === 'open' || result.state === 'submitted')) {
          setInvite({ token, state: result.state });
        } else if (!urlToken) {
          forgetInvite(token);
        }
      })
      .catch(() => {
        // Offline or a hiccup: show the normal screen; the invite stays remembered.
      });
    return () => {
      cancelled = true;
    };
  }, [fromUrl]);

  return invite;
}
