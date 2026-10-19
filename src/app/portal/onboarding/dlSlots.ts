/**
 * License photo slots for dl_photos. The slots remember which item they belong
 * to, so an upload decides whether to start fresh from the CURRENT slots, not
 * from the render it was picked in. Two uploads in flight at once (front and
 * back picked back to back) then add to each other instead of wiping.
 */
export type DlSlots = { itemId: string | null; front: string; back: string };

export const EMPTY_DL_SLOTS: DlSlots = { itemId: null, front: '', back: '' };

export function addDlSlot(prev: DlSlots, itemId: string, slot: 'front' | 'back', folderPath: string): DlSlots {
  const base = prev.itemId === itemId ? prev : { ...EMPTY_DL_SLOTS, itemId };
  return { ...base, [slot]: folderPath };
}

/** The folder to submit once both sides are in, otherwise ''. */
export function dlReference(slots: DlSlots, folderPath: string): string {
  return slots.front && slots.back ? folderPath : '';
}
