// Server side only: config/fiberRepMap is not client-readable.

/** The dealer codes config/fiberRepMap maps to this uid, and only this uid's. */
export async function ownDealerCodes(db: FirebaseFirestore.Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection('config').doc('fiberRepMap').get();
  const map = snap.data()?.map;
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, unknown>)
    .filter(([, mapped]) => mapped === uid)
    .map(([code]) => code)
    .sort();
}
