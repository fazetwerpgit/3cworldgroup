'use client';

import { cn } from '@/lib/utils';
import { getAuthorColor, getInitials } from '@/lib/chat/authorColor';

interface ChatAvatarProps {
  authorId: string;
  authorName: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Colored-initials avatar chip; the author's name is always rendered as text alongside it. */
export function ChatAvatar({ authorId, authorName, size = 'md', className }: ChatAvatarProps) {
  const { bg, fg } = getAuthorColor(authorId);
  const initials = getInitials(authorName);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 select-none place-items-center rounded-full font-semibold',
        size === 'md' ? 'size-8 text-xs' : 'size-6 text-[10px]',
        className
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {initials}
    </span>
  );
}
