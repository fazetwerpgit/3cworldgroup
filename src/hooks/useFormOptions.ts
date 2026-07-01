'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { FORM_OPTION_DEFAULTS, OptionKey } from '@/lib/forms/formOptionsRegistry';

export function useFormOptions(): { options: Record<OptionKey, string[]>; loading: boolean } {
  const [options, setOptions] = useState<Record<OptionKey, string[]>>(FORM_OPTION_DEFAULTS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/portal/forms/options', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (active && res.ok && json.options) setOptions(json.options);
      } catch {
        // keep defaults
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { options, loading };
}
