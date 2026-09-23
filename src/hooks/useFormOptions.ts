'use client';
import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { FORM_OPTION_DEFAULTS, OptionKey } from '@/lib/forms/formOptionsRegistry';

/**
 * The admin-editable option lists. `failed` is true when the lists could not be
 * loaded (the defaults are showing), so a page can say "Couldn't load" instead
 * of "none set up"; `retry` loads them again.
 */
export function useFormOptions(): {
  options: Record<OptionKey, string[]>;
  loading: boolean;
  failed: boolean;
  retry: () => void;
} {
  const [options, setOptions] = useState<Record<OptionKey, string[]>>(FORM_OPTION_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error('Not signed in');
        const res = await fetch('/api/portal/forms/options', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok || !json.options) throw new Error('Options failed');
        if (active) {
          setOptions(json.options);
          setFailed(false);
        }
      } catch {
        // keep defaults
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  return { options, loading, failed, retry };
}
