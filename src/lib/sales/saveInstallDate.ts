import { getIdToken } from '@/lib/firebase/getIdToken';

// Client side of PATCH /api/portal/sales/[id]/install-date: the one edit a rep
// makes to their own sale. Every failure comes back as a line the rep can act
// on, and a hung request on one bar of signal gives up instead of spinning.

export const INSTALL_DATE_SAVE_TIMEOUT_MS = 20_000;

export const NO_SIGNAL_INSTALL_MESSAGE = 'No signal. Tap Save to try again.';
export const INSTALL_SAVE_FAILED_MESSAGE = "Couldn't save the date. Tap Save to try again.";

export type SaveInstallDateResult = { ok: true; installDate: string } | { ok: false; error: string };

/** Sets the install day (YYYY-MM-DD) on the caller's own sale. */
export async function saveInstallDate(
  saleId: string,
  day: string,
  { timeoutMs = INSTALL_DATE_SAVE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<SaveInstallDateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await getIdToken();
    const response = await fetch(`/api/portal/sales/${encodeURIComponent(saleId)}/install-date`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ installDate: day }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as { installDate?: string; error?: string } | null;
    if (response.ok && data?.installDate) return { ok: true, installDate: data.installDate };
    // The route's 400/409 lines are written for the rep ("Install date is
    // before the sale date"); anything else is ours to explain.
    if ((response.status === 400 || response.status === 409) && data?.error) return { ok: false, error: data.error };
    if (response.status === 403) return { ok: false, error: 'You can only change your own sales.' };
    return { ok: false, error: INSTALL_SAVE_FAILED_MESSAGE };
  } catch {
    return { ok: false, error: NO_SIGNAL_INSTALL_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}
