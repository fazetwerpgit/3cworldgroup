/**
 * The Board's order, shared by the leaderboard API and Ask 3C so both give a
 * rep the same rank: score high to low, then ties by name A to Z, then rep id.
 */
export function boardOrder(
  a: { score: number; name: string; id: string },
  b: { score: number; name: string; id: string },
): number {
  return b.score - a.score || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
