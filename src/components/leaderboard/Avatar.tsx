'use client';

import { useState } from 'react';
import { getInitials } from '@/lib/chat/authorColor';
import type { LeaderboardEntry } from './LeaderboardTable';
import styles from './leaderboard.module.css';

type AvatarSize = 'side' | 'center' | 'row';
type AvatarTone = 'gold' | 'silver' | 'bronze' | 'neutral';

const sizeClass: Record<AvatarSize, string> = {
  center: styles.avatarCenter,
  side: styles.avatarSide,
  row: styles.avatarRow,
};

const toneClass: Record<AvatarTone, string> = {
  gold: styles.avatarGold,
  silver: styles.avatarSilver,
  bronze: styles.avatarBronze,
  neutral: '',
};

export function Avatar({
  entry,
  size = 'row',
  tone = 'neutral',
  decorative = true,
}: {
  entry?: LeaderboardEntry;
  size?: AvatarSize;
  tone?: AvatarTone;
  decorative?: boolean;
}) {
  // Tracks the URL that failed rather than a boolean, so a corrected photo URL
  // still gets a fresh attempt. Same convention as ChatAvatar.
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);

  const className = `${sizeClass[size]} ${toneClass[tone]}`;

  if (!entry) {
    return <span className={`${sizeClass[size]} ${styles.openAvatar}`} aria-hidden="true" />;
  }

  const photo = entry.avatar && entry.avatar !== failedUrl ? entry.avatar : null;

  if (photo) {
    return (
      <span className={`${className} ${styles.avatarPhoto}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" onError={() => setFailedUrl(photo)} />
      </span>
    );
  }

  // One light disc everywhere, podium and rows alike. A per-person colour was
  // tried here and lost: rank is what this screen is about, and ten saturated
  // chips fought the medal rings above them for attention.
  return (
    <span
      className={`${className} ${styles.avatarFallback}`}
      aria-hidden={decorative}
      aria-label={decorative ? undefined : `${entry.salesRepName} avatar`}
      role={decorative ? undefined : 'img'}
    >
      {getInitials(entry.salesRepName)}
    </span>
  );
}
