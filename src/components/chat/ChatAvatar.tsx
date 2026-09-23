'use client';

import { useState } from 'react';
import { getAuthorColor, getInitials } from '@/lib/chat/authorColor';
import c from './chat.module.css';

interface ChatAvatarProps {
  authorId: string;
  authorName: string;
  // Optional profile photo (synced Google SSO photoURL or an uploaded avatar).
  // Falls back to the initials chip on a missing URL or a failed load.
  avatarUrl?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Photo avatar when available, else a D initials chip tinted with the
 *  author's name colour; the author's name is always rendered as text alongside it. */
export function ChatAvatar({ authorId, authorName, avatarUrl, size = 'md', className = '' }: ChatAvatarProps) {
  const { nameDark } = getAuthorColor(authorId);
  const initials = getInitials(authorName);
  // Tracks which URL last failed to load, not a plain boolean — so a new author
  // (or a corrected URL) always gets a fresh attempt without needing an effect.
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const showPhoto = !!avatarUrl && avatarUrl !== failedUrl;

  return (
    <span
      aria-hidden="true"
      className={`${c.avatar} ${size === 'md' ? c.avatarMd : c.avatarSm} ${className}`.trim()}
      style={showPhoto ? undefined : { color: nameDark }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" onError={() => setFailedUrl(avatarUrl)} />
      ) : (
        initials
      )}
    </span>
  );
}
