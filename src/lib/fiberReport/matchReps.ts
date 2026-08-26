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
  users: Array<{ uid: string; displayName?: unknown }>,
): Map<string, string> {
  const fullNames = new Map<string, string>();
  for (const user of users) {
    const normalized = normalizeRepName(user.displayName);
    if (normalized && user.uid && !fullNames.has(normalized)) fullNames.set(normalized, user.uid);
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
  for (const [key, uid] of looseNames) {
    if (!index.has(key)) index.set(key, uid);
  }
  return index;
}

export function matchOrder(
  order: { repDealerId: string; repName: string },
  dealerMap: Record<string, string>,
  nameIndex: Map<string, string>,
): string | null {
  const dealerId = order.repDealerId.trim();
  if (dealerId && dealerMap[dealerId]) return dealerMap[dealerId];

  const normalized = normalizeRepName(order.repName);
  if (!normalized) return null;
  const fullMatch = nameIndex.get(normalized);
  if (fullMatch) return fullMatch;

  const loose = looseName(normalized);
  return loose ? nameIndex.get(loose) ?? null : null;
}
