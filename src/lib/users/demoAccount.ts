// Demo accounts (App Review, automated testing) are real, active portal users
// that nobody else should ever see: they are left out of every list, roster,
// chat audience, recipient list and owner count built from the users
// collection. Marked on the users/{uid} doc with `demoAccount: true`; any
// other value (missing, false, "true") is a normal user.
//
// Their SALES carry the same stamp: the sales POST writes `demoAccount: true`
// on every sale a demo account logs, and every cross-user sales reader
// (leaderboard + weekly challenge + recent feed, Ask's Board, the owner book,
// company tape, admin sales list and carrier status, alert jobs, install-date
// sync, order-number duplicate check) drops stamped sales. The demo account
// still sees its own (saleVisibleTo). Sales logged BEFORE the account was
// flagged are not stamped; stamp them by hand if any exist.
//
// OPS — flagging an EXISTING account: set `demoAccount: true` on users/{uid},
// then run POST /api/portal/chat/channels/sync (admin). The chat API denies a
// demo account at once, but firestore.rules reads chatChannels.memberIds
// directly, and only the sync drops the uid from memberIds on every channel;
// until then the client SDK can still read channels it was a member of.
// Un-flagging (removing demoAccount from users/{uid}) does NOT un-hide its
// sales: they keep their stamp and stay hidden until it is removed by hand.

/** The users/{uid} field that marks a demo account (also stamped on its sales). */
export const DEMO_ACCOUNT_FIELD = 'demoAccount';

type DocData = Record<string, unknown> | null | undefined;

export function isDemoAccount(data: DocData): boolean {
  return data?.[DEMO_ACCOUNT_FIELD] === true;
}

/** Snapshot-shaped convenience: drops demo-account docs from a query result. */
export function withoutDemoDocs<T extends { data(): DocData }>(docs: readonly T[]): T[] {
  return docs.filter((doc) => !isDemoAccount(doc.data()));
}

/** A sales doc logged by a demo account (stamped by the sales POST). */
export function isDemoSale(data: DocData): boolean {
  return data?.[DEMO_ACCOUNT_FIELD] === true;
}

/**
 * Whether a sale belongs in a view built for `viewerUid`: every real sale, and
 * a demo sale only for the demo account that logged it. Pass no viewer for a
 * view nobody owns (owner book, alert jobs, carrier sync): demo sales drop.
 */
export function saleVisibleTo(data: DocData, viewerUid?: string | null): boolean {
  if (!isDemoSale(data)) return true;
  return !!viewerUid && data?.salesRepId === viewerUid;
}
