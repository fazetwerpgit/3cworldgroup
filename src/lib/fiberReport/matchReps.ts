import { isDemoAccount } from '@/lib/users/demoAccount';

export type NameMatchUser = { uid: string; displayName?: unknown };

/**
 * The users that may take part in rep NAME matching: active, non-demo accounts
 * only. A pending signup chooses its own displayName (firestore.rules), so it
 * could claim a real rep's orders, and through the learned dealer map every
 * later order on that code; inactive and demo accounts must never receive
 * orders either. Dealer-code matches (config/fiberRepMap) are unaffected.
 */
export function nameMatchUsers(
  docs: ReadonlyArray<{ id: string; data(): Record<string, unknown> | null | undefined }>,
): NameMatchUser[] {
  const users: NameMatchUser[] = [];
  for (const doc of docs) {
    const data = doc.data();
    if (data?.status !== 'active' || isDemoAccount(data)) continue;
    users.push({ uid: doc.id, displayName: data.displayName });
  }
  return users;
}

/** Normalize a report or portal representative name for matching. */
export function normalizeRepName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looseName(normalized: string): string {
  const words = normalized.split(' ').filter(Boolean);
  return words.length >= 3 ? `${words[0]} ${words[words.length - 1]}` : '';
}

/**
 * Build a name lookup with exact normalized names and unambiguous first/last
 * fallbacks for names that contain a middle name (or names).
 */
export function buildNameIndex(
  users: NameMatchUser[],
): Map<string, string> {
  const fullNames = new Map<string, string>();
  const ambiguousFullNames = new Set<string>();
  for (const user of users) {
    const normalized = normalizeRepName(user.displayName);
    if (!normalized || !user.uid || ambiguousFullNames.has(normalized)) continue;
    const existing = fullNames.get(normalized);
    if (existing === undefined) {
      fullNames.set(normalized, user.uid);
    } else if (existing !== user.uid) {
      // Two accounts with the same name: neither may be chosen automatically.
      fullNames.delete(normalized);
      ambiguousFullNames.add(normalized);
    }
  }

  const looseNames = new Map<string, string>();
  const ambiguousLooseNames = new Set<string>();
  for (const user of users) {
    const normalized = normalizeRepName(user.displayName);
    const loose = looseName(normalized);
    if (!loose || !user.uid || ambiguousLooseNames.has(loose)) continue;
    const existing = looseNames.get(loose);
    if (existing === undefined) {
      looseNames.set(loose, user.uid);
    } else if (existing !== user.uid) {
      // Keep the key out of the index permanently: an ambiguous fallback must
      // never choose a representative automatically.
      looseNames.delete(loose);
      ambiguousLooseNames.add(loose);
    }
  }

  // Exact names always win, even if an exact key also appeared as a loose key.
  const index = new Map<string, string>(fullNames);
  // An ambiguous exact name stays out entirely, even as another user's loose key.
  for (const [key, uid] of looseNames) {
    if (!index.has(key) && !ambiguousFullNames.has(key)) index.set(key, uid);
  }
  return index;
}

function isPrefixPair(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * Last-resort fuzzy tier: same last name with first names that are prefixes of
 * each other ("wil"/"will"), or a single-word portal name equal to the report
 * first name ("jeremy" vs "jeremy mcfarland"). Only an UNAMBIGUOUS candidate
 * (exactly one user) may match — two plausible users mean no auto-match.
 */
export function fuzzyMatchName(
  reportName: string,
  users: NameMatchUser[],
): string | null {
  const normalized = normalizeRepName(reportName);
  const reportWords = normalized.split(' ').filter(Boolean);
  if (reportWords.length < 1) return null;
  const reportFirst = reportWords[0];
  const reportLast = reportWords[reportWords.length - 1];

  const candidates = new Set<string>();
  for (const user of users) {
    if (!user.uid) continue;
    const portalWords = normalizeRepName(user.displayName).split(' ').filter(Boolean);
    if (portalWords.length === 0) continue;
    if (portalWords.length === 1) {
      if (reportWords.length >= 2 && portalWords[0] === reportFirst) candidates.add(user.uid);
      continue;
    }
    if (reportWords.length < 2) continue;
    const portalFirst = portalWords[0];
    const portalLast = portalWords[portalWords.length - 1];
    if (portalLast === reportLast && isPrefixPair(portalFirst, reportFirst)) candidates.add(user.uid);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

export function matchOrder(
  order: { repDealerId: string; repName: string },
  dealerMap: Record<string, string>,
  nameIndex: Map<string, string>,
  users?: NameMatchUser[],
): string | null {
  const dealerId = order.repDealerId.trim();
  if (dealerId && dealerMap[dealerId]) return dealerMap[dealerId];

  const normalized = normalizeRepName(order.repName);
  if (!normalized) return null;
  const fullMatch = nameIndex.get(normalized);
  if (fullMatch) return fullMatch;

  const loose = looseName(normalized);
  const looseMatch = loose ? nameIndex.get(loose) ?? null : null;
  if (looseMatch) return looseMatch;

  return users ? fuzzyMatchName(order.repName, users) : null;
}
