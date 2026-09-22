import { Avatar } from './Avatar';
import { MetricValue } from './MetricValue';
import type { LeaderboardEntry, LeaderboardMetric } from './LeaderboardTable';
import styles from './leaderboard.module.css';

/** The winner's crown. Solid gold rather than the outline icon this replaced:
 *  three points each capped with a ball, a curved base band, and a warm vertical
 *  ramp doing the shading. Drawn as fill rather than stroke, because at this
 *  size a 2px outline closes up its own gaps and turns to mush. Wide and squat
 *  like the reference: about half the avatar across, and no taller than it has
 *  to be. */
function Crown() {
  return (
    <svg className={styles.crown} viewBox="0 0 34 22" aria-hidden="true">
      <defs>
        <linearGradient id="crownMetal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="22">
          <stop offset="0%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#d99a1e" />
        </linearGradient>
      </defs>
      <path
        d="M3.46 20.8L1.67 7.3L7.6 10.9Q8.98 12 10.4 10.3L17.06 2.6L23.6 10.3Q25 12 26.4 10.9L32.33 7.3L30.54 20.8Q17 21.9 3.46 20.8Z"
        fill="url(#crownMetal)"
      />
      <circle cx="17.06" cy="2" r="1.6" fill="url(#crownMetal)" />
      <circle cx="1.67" cy="7.07" r="1.4" fill="url(#crownMetal)" />
      <circle cx="32.33" cy="7.07" r="1.4" fill="url(#crownMetal)" />
      {/* The band. A darker wash rather than a second shape, so the crown keeps
          one silhouette and still reads as having a rim. */}
      <path d="M2.96 17L31.04 17L30.54 20.8Q17 21.9 3.46 20.8Z" fill="#7d5310" opacity="0.3" />
    </svg>
  );
}

/** Half a wreath. A stem that leaves the baseline beside the numeral, bows
 *  outward and curls back in at the tip, carrying nine pairs of pointed leaves
 *  that fan up and outward. Each leaf overlaps about half of the one below it,
 *  so the branch reads as dense foliage and the stem disappears under it rather
 *  than reading as a rope with petals stuck on. Leaves taper from 10px at the
 *  base to 6px at the tip. Mirrored about the centre, the pair leaves a channel
 *  wide enough for the 1 to breathe. Geometry is baked: the leaves were placed
 *  along the stem's tangent and normal, then frozen to path data. */
const STEM_PATH = 'M24.96 29.97C12.51 28.58 0.71 20.73 9.23 5.03';

const LEAF_PATHS: string[] = [
  'M21.95 29.87Q16.56 29.53 13.8 35.66Q20.5 35.08 21.95 29.87Z',
  'M20.41 28.84Q20.44 24.95 15.93 23.21Q16.61 28 20.41 28.84Z',
  'M18.19 28.89Q13.14 27.95 9.84 33.42Q16.22 33.63 18.19 28.89Z',
  'M16.83 27.69Q17.33 24.03 13.29 21.83Q13.35 26.43 16.83 27.69Z',
  'M14.69 27.46Q10.09 25.91 6.26 30.59Q12.21 31.65 14.69 27.46Z',
  'M13.59 26.1Q14.59 22.75 11.13 20.1Q10.51 24.42 13.59 26.1Z',
  'M11.6 25.58Q7.57 23.38 3.24 27.11Q8.61 29.06 11.6 25.58Z',
  'M10.82 24.07Q12.35 21.15 9.61 18.07Q8.27 21.96 10.82 24.07Z',
  'M9.05 23.21Q5.78 20.38 1.05 22.94Q5.59 25.82 9.05 23.21Z',
  'M8.66 21.61Q10.7 19.27 8.87 15.85Q6.79 19.12 8.66 21.61Z',
  'M7.18 20.37Q4.9 17.02 0 18.2Q3.43 21.9 7.18 20.37Z',
  'M7.23 18.71Q9.67 17.12 8.88 13.57Q6.18 15.99 7.23 18.71Z',
  'M6.14 17.05Q4.98 13.45 0.28 13.23Q2.38 17.44 6.14 17.05Z',
  'M6.64 15.38Q9.25 14.59 9.47 11.21Q6.41 12.67 6.64 15.38Z',
  'M6.05 13.28Q5.92 9.77 1.77 8.39Q2.59 12.68 6.05 13.28Z',
  'M7 11.59Q9.53 11.5 10.53 8.52Q7.44 9.1 7 11.59Z',
  'M7.03 9.06Q7.66 5.88 4.23 3.75Q4.05 7.78 7.03 9.06Z',
  'M8.44 7.31Q10.74 7.72 12.23 5.22Q9.32 5.14 8.44 7.31Z',
  'M9.21 5.05Q12.04 3.83 11.85 0Q8.6 2.03 9.21 5.05Z',
];

function Branch() {
  return (
    <g>
      <path
        d={STEM_PATH}
        fill="none"
        stroke="url(#laurelMetal)"
        strokeLinecap="round"
        strokeWidth="1.15"
      />
      {LEAF_PATHS.map((d) => (
        <path key={d} d={d} fill="url(#laurelMetal)" />
      ))}
    </g>
  );
}

function Laurel() {
  return (
    <svg className={styles.laurel} viewBox="0 0 78.52 35.66" aria-hidden="true">
      <defs>
        {/* Deliberately dull metal. No light stop and a short range between the
            two, so the wreath has no highlight to catch the eye: it is texture
            behind the numeral, and the 1 stays the one bright object here. */}
        <linearGradient id="laurelMetal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="35.66">
          <stop offset="0%" stopColor="#b8892e" />
          <stop offset="100%" stopColor="#8a6420" />
        </linearGradient>
      </defs>
      <Branch />
      <g transform="translate(78.52 0) scale(-1 1)">
        <Branch />
      </g>
    </svg>
  );
}

interface PodiumSlotProps {
  entry?: LeaderboardEntry;
  rank: 1 | 2 | 3;
  metric: LeaderboardMetric;
  currentUser?: LeaderboardEntry | null;
}

export function PodiumSlot({ entry, rank, metric, currentUser }: PodiumSlotProps) {
  const isCurrentUser = Boolean(entry && entry.salesRepId === currentUser?.salesRepId);
  const avatarTone = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';

  return (
    <article
      className={`${styles.podiumSlot} ${isCurrentUser ? styles.mine : ''}`}
      data-rank={rank}
    >
      <div className={styles.podiumIdentity}>
        {rank === 1 ? <Crown /> : null}
        <Avatar entry={entry} size={rank === 1 ? 'center' : 'side'} tone={avatarTone} />
        <strong className={styles.podiumName}>{entry?.salesRepName ?? 'Open'}</strong>
        {entry ? <MetricValue entry={entry} metric={metric} size="podium" /> : null}
      </div>
      <div className={styles.block}>
        <span className={styles.blockTop} aria-hidden="true" />
        <span className={styles.blockFace}>
          <span className={styles.crest}>
            {rank === 1 ? <Laurel /> : null}
            <span className={styles.blockNumeral} aria-label={`Rank ${rank}`}>{rank}</span>
          </span>
        </span>
      </div>
    </article>
  );
}
