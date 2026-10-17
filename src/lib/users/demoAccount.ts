// Demo accounts (App Review, automated testing) are real, active portal users
// that nobody else should ever see: they are left out of every list, roster,
// chat audience, recipient list and owner count built from the users
// collection. Marked on the users/{uid} doc with `demoAccount: true`; any
// other value (missing, false, "true") is a normal user.

/** The users/{uid} field that marks a demo account. */
export const DEMO_ACCOUNT_FIELD = 'demoAccount';

type DocData = Record<string, unknown> | null | undefined;

export function isDemoAccount(data: DocData): boolean {
  return data?.[DEMO_ACCOUNT_FIELD] === true;
}

/** Snapshot-shaped convenience: drops demo-account docs from a query result. */
export function withoutDemoDocs<T extends { data(): DocData }>(docs: readonly T[]): T[] {
  return docs.filter((doc) => !isDemoAccount(doc.data()));
}
