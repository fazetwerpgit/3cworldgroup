// Test helper (never imported by app code): a stand-in for lib/auth/viewAs in
// route tests whose fake Firestore cannot answer the target lookup. It keeps
// resolveSubject's contract — no header = the caller, a header from anyone but
// the owner = 403, from the owner = the rep — so a route test checks the route
// reads and scopes by the subject. viewAs.test.ts covers resolveSubject itself.
//
//   vi.mock('@/lib/auth/viewAs', async () => (await import('@/lib/auth/viewAsTestStub')).viewAsStubModule());

import type { SubjectIdentity, SubjectResult } from './viewAs';

export const VIEW_AS_TARGET: SubjectIdentity = {
  uid: 'rep-noah',
  name: 'Noah Smith',
  email: 'noah@example.com',
  fieldRole: 'entry_rep',
  status: 'active',
  avatarUrl: null,
  isManagement: false,
  isAdmin: false,
  isOwner: false,
  isManagerOrAbove: false,
};

export async function stubResolveSubject(
  request: { headers: Headers; method?: string },
  caller: { uid: string; isOwner?: boolean }
): Promise<SubjectResult> {
  const target = request.headers.get('x-view-as');
  if (target === null) return { ok: true, viewing: false, uid: caller.uid };
  if (caller.isOwner !== true) return { ok: false, error: 'Forbidden: owner access required', status: 403 };
  if (target !== VIEW_AS_TARGET.uid) return { ok: false, error: 'Rep not found', status: 404 };
  return { ok: true, viewing: true, uid: target, ownerUid: caller.uid, target: VIEW_AS_TARGET };
}

export function viewAsStubModule() {
  return { resolveSubject: stubResolveSubject };
}

/** The headers of an owner viewing as the stub rep. */
export function viewAsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-view-as': VIEW_AS_TARGET.uid, ...extra };
}
