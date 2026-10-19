import { READ_ONLY_ERROR, VIEW_AS_HEADER, isReadMethod } from '@/lib/auth/viewAsHeader';

// The browser half of "View as rep". While a view-as screen is mounted
// (ViewAsScope), window.fetch is wrapped so that:
//  - a GET to one of the rep endpoints those screens read carries
//    `x-view-as: <rep uid>`, and the server answers with the rep's data;
//  - a write to the same endpoints never leaves the browser (403 "Read-only
//    view"), in case a control that writes was missed. The server refuses any
//    write carrying the header as well (src/proxy.ts).
// Every other request — chat, notifications, push, presence — goes out
// untouched, as the owner.

/** The rep GET endpoints the in-scope screens (Home, Sales, sale detail, Board) read. */
const VIEW_AS_READS: readonly RegExp[] = [
  /^\/api\/portal\/sales$/,
  /^\/api\/portal\/sales\/(status|callouts)$/,
  // One sale: /api/portal/sales/<id> (not the sibling routes below it).
  /^\/api\/portal\/sales\/(?!status$|callouts$|company-stats$|scan$)[^/]+$/,
  /^\/api\/portal\/comp-plan$/,
  /^\/api\/portal\/leaderboard$/,
  /^\/api\/portal\/solar\/leaderboard$/,
  /^\/api\/portal\/calls$/,
  /^\/api\/portal\/onboarding$/,
];

/** Writes under these paths are blocked in the browser while viewing. */
const VIEW_AS_WRITE_GUARD: readonly RegExp[] = [
  /^\/api\/portal\/sales(\/|$)/,
  /^\/api\/portal\/comp-plan(\/|$)/,
  /^\/api\/portal\/leaderboard(\/|$)/,
  /^\/api\/portal\/solar\/leaderboard(\/|$)/,
  /^\/api\/portal\/calls(\/|$)/,
  /^\/api\/portal\/onboarding(\/|$)/,
];

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function requestUrl(input: FetchInput, origin: string): URL | null {
  try {
    if (typeof input === 'string') return new URL(input, origin);
    if (input instanceof URL) return input;
    return new URL(input.url, origin);
  } catch {
    return null;
  }
}

function requestMethod(input: FetchInput, init: FetchInit): string {
  if (init?.method) return init.method;
  if (typeof input === 'object' && !(input instanceof URL) && 'method' in input) return input.method;
  return 'GET';
}

export type ViewAsDecision =
  | { kind: 'pass' }
  | { kind: 'header'; init: RequestInit }
  | { kind: 'block' };

/**
 * What the wrapper does with one request. Pure, so it is tested on its own.
 * `origin` is the page's origin: only same-origin portal paths are touched.
 */
export function viewAsDecision(
  input: FetchInput,
  init: FetchInit,
  subjectUid: string,
  origin: string
): ViewAsDecision {
  const url = requestUrl(input, origin);
  if (!url || url.origin !== origin) return { kind: 'pass' };
  const path = url.pathname;
  const method = requestMethod(input, init);

  if (!isReadMethod(method)) {
    return VIEW_AS_WRITE_GUARD.some((re) => re.test(path)) ? { kind: 'block' } : { kind: 'pass' };
  }
  if (method.toUpperCase() !== 'GET' || !VIEW_AS_READS.some((re) => re.test(path))) return { kind: 'pass' };

  const headers = new Headers(
    init?.headers ?? (typeof input === 'object' && !(input instanceof URL) ? input.headers : undefined)
  );
  headers.set(VIEW_AS_HEADER, subjectUid);
  return { kind: 'header', init: { ...init, headers } };
}

export function readOnlyResponse(): Response {
  return new Response(JSON.stringify({ error: READ_ONLY_ERROR }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

let original: typeof fetch | null = null;
let activeUid: string | null = null;
let installs = 0;

/**
 * Wraps window.fetch for `subjectUid` until the returned function is called.
 * Nested installs share one wrapper (the latest uid wins); the last uninstall
 * restores the original fetch.
 */
export function installViewAsFetch(subjectUid: string): () => void {
  if (typeof window === 'undefined') return () => {};
  activeUid = subjectUid;
  installs += 1;
  if (!original) {
    const base = window.fetch;
    original = base;
    window.fetch = function viewAsFetch(input: FetchInput, init?: FetchInit) {
      const uid = activeUid;
      if (!uid) return base.call(window, input, init);
      const decision = viewAsDecision(input, init, uid, window.location.origin);
      if (decision.kind === 'block') return Promise.resolve(readOnlyResponse());
      if (decision.kind === 'header') return base.call(window, input, decision.init);
      return base.call(window, input, init);
    } as typeof fetch;
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    installs -= 1;
    if (installs <= 0) {
      installs = 0;
      activeUid = null;
      if (original) window.fetch = original;
      original = null;
    }
  };
}
