'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * The uid whose data this screen shows, for the data cache: the signed-in
 * user, or the rep under "View as rep" (AuthSubjectProvider). Null outside an
 * AuthProvider, where nothing is cached.
 */
export function useCacheSubject(): string | null {
  try {
    return useAuth()?.user?.uid ?? null;
  } catch {
    return null;
  }
}
