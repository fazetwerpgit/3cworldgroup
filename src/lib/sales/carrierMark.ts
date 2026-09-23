import { getChannelById } from '@/types/channels';

// Short carrier wordmarks for rows and cards. Channel ids come from
// types/channels.ts; a few channel names are too long for a row chip.
const SHORT: Record<string, string> = {
  tfiber: 'T-Fiber',
};

/** "T-Fiber", "AT&T"… for a channel id; '' when the id is unknown or empty. */
export function carrierMark(companyId: string | undefined | null): string {
  if (!companyId) return '';
  return SHORT[companyId] ?? getChannelById(companyId)?.name ?? '';
}

// Plan names repeat the carrier ("TFiber 1 Gig", "AT&T Internet 300"); next to
// the wordmark only the speed part is worth reading.
const PREFIX: Record<string, RegExp> = {
  tfiber: /^t-?fiber\s+/i,
  att: /^at&t\s+(internet\s+)?/i,
};

/** The plan name without a leading carrier name, e.g. "TFiber 1 Gig" -> "1 Gig". */
export function planWithoutCarrier(plan: string, companyId: string | undefined | null): string {
  if (!companyId) return plan;
  const name = getChannelById(companyId)?.name ?? '';
  const pattern = PREFIX[companyId] ?? (name ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i') : null);
  const short = pattern ? plan.replace(pattern, '') : plan;
  return short.trim() || plan;
}
