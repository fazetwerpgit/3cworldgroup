import type { NoticeEvent, NoticeKind } from '@/lib/app/bridge';

// The state behind <AppNotice>: one toast at a time. Pure, so it is tested.

export interface ShownNotice {
  id: string;
  kind: Exclude<NoticeKind, 'dismiss'>;
  message: string;
}

/** How long a finished notice stays up. Progress stays until replaced. */
export const NOTICE_HIDE_MS: Record<ShownNotice['kind'], number | null> = {
  progress: null,
  success: 3500,
  error: 7000,
};

/** The next toast after a notice event. A dismiss only clears its own id. */
export function nextNotice(current: ShownNotice | null, event: NoticeEvent): ShownNotice | null {
  if (event.kind === 'dismiss') return current && current.id === event.id ? null : current;
  return { id: event.id, kind: event.kind, message: event.message };
}
