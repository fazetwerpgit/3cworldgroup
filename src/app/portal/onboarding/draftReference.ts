import { isStorageItem } from '@/lib/onboarding/uploads';

/**
 * The reference the item's Submit button sends. An upload item only sends a
 * file uploaded in this sitting: its stored reference is the one already on
 * review (or returned), so falling back to it would resend rejected files.
 * Typed items start from their current reference so it can be edited.
 */
export function draftReference(
  item: { id: string; reference?: string | null },
  draftItemId: string | null | undefined,
  draft: string
): string {
  if (draftItemId === item.id) return draft;
  return isStorageItem(item.id) ? '' : (item.reference ?? '');
}
