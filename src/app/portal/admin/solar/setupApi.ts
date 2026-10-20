import { getIdToken } from '@/lib/firebase/getIdToken';

/** A Bearer-authorized JSON call from Admin > Solar > Setup. Throws Error(server message) on a non-2xx. */
export async function api(url: string, init?: RequestInit) {
  const token = await getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token ?? ''}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : '');
  return data;
}

export const failure = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;
