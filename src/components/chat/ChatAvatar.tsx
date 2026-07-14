'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getAuthorColor, getInitials } from '@/lib/chat/authorColor';

interface ChatAvatarProps {
  authorId: string;
  authorName: string;
  // Optional profile photo (synced Google SSO photoURL or an uploaded avatar).
  // Falls back to the colored-initials chip on a missing URL or a failed load.
  avatarUrl?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Photo avatar when available, else the colored-initials chip; the author's
 *  name is always rendered as text alongside it. */
export function ChatAvatar({ authorId, authorName, avatarUrl, size = 'md', className }: ChatAvatarProps) {
  const { bg, fg } = getAuthorColor(authorId);
  const initials = getInitials(authorName);
  // Tracks which URL last failed to load, not a plain boolean — so a new author
  // (or a corrected URL) always gets a fresh attempt without needing an effect.
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const showPhoto = !!avatarUrl && avatarUrl !== failedUrl;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 select-none place-items-center rounded-full font-semibold',
        size === 'md' ? 'size-8 text-xs' : 'size-6 text-[10px]',
        className
      )}
      style={showPhoto ? undefined : { backgroundColor: bg, color: fg }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="chat-line-avatar-photo block size-full rounded-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
