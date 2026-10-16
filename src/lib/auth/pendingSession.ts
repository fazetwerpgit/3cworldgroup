'use client';

// An unapproved self-signup is signed out the moment their pending profile
// resolves (AuthContext), so the "Account pending approval" screen has no live
// session. To let them withdraw the request there (App Store 5.1.1(v)),
// AuthContext parks the account's ID token here, in memory only, just before
// that sign-out. ID tokens live an hour; after that, or after a reload, the
// person signs in again, lands on the same screen and a fresh token is parked.

let pendingIdToken: string | null = null;

export function rememberPendingIdToken(token: string | null): void {
  pendingIdToken = token;
}

export function pendingIdTokenForDelete(): string | null {
  return pendingIdToken;
}

export function clearPendingIdToken(): void {
  pendingIdToken = null;
}
