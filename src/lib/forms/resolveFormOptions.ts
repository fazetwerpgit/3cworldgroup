import { adminDb } from '@/lib/firebase/admin';
import { mergeOptions, OPTION_KEYS, OptionKey } from './formOptionsRegistry';

// Reads admin overrides from Firestore (collection `formOptions`, one doc per key
// with a `values: string[]` field) and merges them over the code defaults. Server
// side of the resolver, used by submit routes so validation matches what reps saw.
export async function getResolvedFormOptions(): Promise<Record<OptionKey, string[]>> {
  const overrides: Partial<Record<OptionKey, string[]>> = {};
  if (adminDb) {
    try {
      const snap = await adminDb.collection('formOptions').get();
      snap.forEach((doc) => {
        const key = doc.id as OptionKey;
        if (!OPTION_KEYS.includes(key)) return;
        const values = doc.data()?.values;
        if (Array.isArray(values) && values.every((v) => typeof v === 'string')) {
          overrides[key] = values;
        }
      });
    } catch {
      // On any read failure, fall back to pure defaults — forms must never break.
    }
  }
  return mergeOptions(overrides);
}
