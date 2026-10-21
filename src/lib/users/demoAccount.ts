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
// Their FORMS carry it too: submitFormRecord stamps a demo account's form with
// status 'demo' (never 'new'), reviewQuery drops it, and it alerts nobody
// (notifySubmission, bug-report route).
//
// OPS — flagging an EXISTING account: set `demoAccount: true` on users/{uid},
// then run POST /api/portal/chat/channels/sync (admin). The chat API denies a
// demo account at once, but firestore.rules reads chatChannels.memberIds
// directly, and only the sync drops the uid from memberIds on every channel;
// until then the client SDK can still read channels it was a member of.
// CHAT: a demo account reaches exactly one kind of channel, the App Review
// sandbox (chatChannels/{id}.demoSandbox === true; lib/chat/channels.ts), whose
// members are demo accounts plus Jacob only (lib/chat/sandboxStaff). Its messages stay inside that
// channel: the real-user chat surfaces that read messages (leaderboard callouts,
// the owner book's chat stats) read chatChannels/all-company only, the company
// tape reads sales, and Ask reads no chat. Setup: docs/ios-app/APP-REVIEW-DEMO.md.
// Un-flagging (removing demoAccount from users/{uid}) does NOT un-hide its
// sales: they keep their stamp and stay hidden until it is removed by hand.

// TEST ACCOUNTS (owner-approved QA logins on prod): users/{uid}.testAccount ===
// true, set only by the Admin SDK (scripts/create-test-accounts.mjs; firestore
// rules deny every client write to users docs). Unlike a demo account, a test
// account is a normal user for its own screens (real roles, real chat access
// through manual additions, its forms behave normally); only its DATA stays out
// of everyone else's views. Its sales and solar leads/bookings carry
// `testAccount: true`, and every reader that drops a demo sale drops a test sale
// too (isDemoSale / saleVisibleTo). isHiddenUser (demo or test) keeps both out
// of rosters, and automatic chat membership skips a test account
// (lib/chat/channels). Chat redaction, forms and fiber report matching are
// demo-only on purpose.

/** The users/{uid} field that marks a demo account (also stamped on its sales). */
export const DEMO_ACCOUNT_FIELD = 'demoAccount';

/** The users/{uid} field that marks a QA test account (also stamped on its sales and solar records). */
export const TEST_ACCOUNT_FIELD = 'testAccount';

type DocData = Record<string, unknown> | null | undefined;

export function isDemoAccount(data: DocData): boolean {
  return data?.[DEMO_ACCOUNT_FIELD] === true;
}

/** A QA test account (users/{uid}.testAccount === true), or a record one created. */
export function isTestAccount(data: DocData): boolean {
  return data?.[TEST_ACCOUNT_FIELD] === true;
}

/** A users doc nobody else should see in a roster: a demo account or a test account. */
export function isHiddenUser(data: DocData): boolean {
  return isDemoAccount(data) || isTestAccount(data);
}

/** Snapshot-shaped convenience: drops demo and test account docs from a query result. */
export function withoutHiddenUserDocs<T extends { data(): DocData }>(docs: readonly T[]): T[] {
  return docs.filter((doc) => !isHiddenUser(doc.data()));
}

/** Snapshot-shaped convenience: drops demo-account docs from a query result. */
export function withoutDemoDocs<T extends { data(): DocData }>(docs: readonly T[]): T[] {
  return docs.filter((doc) => !isDemoAccount(doc.data()));
}

/**
 * A sales doc logged by a demo account or a test account (the sales POST
 * stamps `demoAccount: true` / `testAccount: true`): hidden from everyone else.
 */
export function isDemoSale(data: DocData): boolean {
  return data?.[DEMO_ACCOUNT_FIELD] === true || data?.[TEST_ACCOUNT_FIELD] === true;
}

/**
 * Whether a sale belongs in a view built for `viewerUid`: every real sale, and
 * a demo or test sale only for the account that logged it. Pass no viewer for a
 * view nobody owns (owner book, alert jobs, carrier sync): demo and test sales drop.
 */
export function saleVisibleTo(data: DocData, viewerUid?: string | null): boolean {
  if (!isDemoSale(data)) return true;
  return !!viewerUid && data?.salesRepId === viewerUid;
}
