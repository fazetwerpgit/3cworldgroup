import { auth } from '@/lib/firebase/config';

export interface OpenRequest {
  createdAt?: string | null;
}

/**
 * A request queue's open items: status 'new', the same definition as the
 * owner's company summary count. The Requests nav badge and tab counts use it
 * (via opsQueues). Throws when the queue fails to load.
 */
export async function fetchOpenRequests(form: string): Promise<OpenRequest[]> {
  const token = await auth?.currentUser?.getIdToken();
  const res = await fetch(`/api/portal/forms/${form}/review`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'failed');
  const rows: (OpenRequest & { status?: string })[] = Array.isArray(json.submissions) ? json.submissions : [];
  return rows.filter((row) => row.status === 'new');
}
