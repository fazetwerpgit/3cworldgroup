// Shared by the server (lib/auth/viewAs, src/proxy.ts) and the browser
// (contexts/ViewAsContext). No server imports here: the proxy and the client
// bundle both load this file.

/** Names the rep an owner is viewing as. Only ever honoured on reads. */
export const VIEW_AS_HEADER = 'x-view-as';
export const READ_ONLY_ERROR = 'Read-only view';

/** Methods that only read. Everything else carrying the header is refused. */
export function isReadMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

/** A rep the owner may view as (GET /api/portal/view-as). Names and role only. */
export interface ViewAsRep {
  uid: string;
  displayName: string;
  email: string;
  fieldRole: string;
  avatarUrl: string | null;
}
