/** Which board the Leaderboard shows: the fiber board, or the solar board (booked consults). */
export type LeaderboardBoard = 'fiber' | 'solar';

/** The Fiber | Solar segmented switch, offered only to a viewer with both boards. */
export interface BoardSwitch {
  board: LeaderboardBoard;
  onChange: (board: LeaderboardBoard) => void;
}

export const BOARD_OPTIONS: { value: LeaderboardBoard; label: string }[] = [
  { value: 'fiber', label: 'Fiber' },
  { value: 'solar', label: 'Solar' },
];

/**
 * The boards a viewer may see. Solar needs solar:read (a solar role, or an
 * admin/owner); a solar-only rep (isSolarOnlyUser) has no fiber board. A fiber
 * rep with no solar role never sees anything solar.
 */
export function boardsFor(opts: { solarRead: boolean; solarOnly: boolean }): LeaderboardBoard[] {
  if (opts.solarOnly) return ['solar'];
  return opts.solarRead ? ['fiber', 'solar'] : ['fiber'];
}
