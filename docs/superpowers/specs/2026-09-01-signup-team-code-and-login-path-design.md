# Signup team code + easy login path — design

Date: 2026-09-01. Approved by Jacob in conversation.

## Problem

Job applicants find the public site's "Employee Login" link, click "Need an
account? Create one", and self-register at `/portal/signup` before anyone has
talked to them. They land in the Admin → Users Pending queue with no link to
their application, and managers have to sort real hires from applicants.

Separately, reps need a URL for the portal login they cannot get wrong, and a
push to install the portal to their iPhone home screen.

## Constraints

- Self-signup must stay. Returning people the company already knows get hired
  without a recruiting invite and register themselves.
- The recruiting invite flow (`/onboard/{token}`) and admin-created accounts
  (`/portal/admin/users/new`) are unchanged.
- All reps use modern iPhones; the portal already ships a web manifest with
  `display: standalone` and `start_url: /portal/dashboard`.
- Threat model is confused applicants, not attackers. The reCAPTCHA gate
  already covers bots.

## Part 1 — Team code gate on signup

### Behaviour

- `SignupForm` gains one required text field, **Team code**, placed above the
  password fields. Input is trimmed and compared case-insensitively.
- On submit, after the existing reCAPTCHA check and before Firebase
  `createUserWithEmailAndPassword`, the client POSTs `{ code }` to
  `/api/portal/auth/team-code`. The route compares against the
  `PORTAL_TEAM_CODE` environment variable (case-insensitive, trimmed) and
  returns `{ ok: true }` or `{ ok: false }` with HTTP 200. Missing env var
  returns `{ ok: false }` and logs a server warning (fail closed).
- On `{ ok: false }` the form shows: "That team code isn't right. Ask your
  manager for the current one." and does not create an account.
- On `{ ok: true }` signup proceeds as today. The `users/{uid}` document
  written by `AuthContext` gains `signupMethod: "team_code"`.
- Env: `PORTAL_TEAM_CODE` set in Vercel (all envs) and `.env.local`. Initial
  value chosen by Jacob at deploy time.

### Files

- `src/components/auth/SignupForm.tsx` — new field, call to route, error copy.
- `src/app/api/portal/auth/team-code/route.ts` — new. Mirrors the shape of
  `src/app/api/portal/auth/captcha/route.ts`.
- `src/contexts/AuthContext.tsx` — `signUp` accepts and writes `signupMethod`.
- `.env.local`, Vercel env — `PORTAL_TEAM_CODE`.

### Out of scope

- Server-side creation of the `users` document. Signup remains client-side
  Firebase Auth as today; the gate is a UX gate, consistent with the existing
  reCAPTCHA pattern.
- Per-manager or expiring codes. One shared value, rotated via env.

## Part 2 — Copy that steers applicants away

Exact strings:

| Location | Current | New |
|---|---|---|
| Signup title (`SignupForm.tsx`) | "Create a member account" | "Join with your team code" |
| Signup subtitle | "Use an email you check regularly. Manager approval follows verification." | "Your manager gave you a team code. Use an email you check regularly." |
| Signup steps | "Verify your email / Manager approves your account / You get your role and start onboarding" | "Enter your team code / Verify your email / Your manager activates your account" |
| Signup submit button | "Request access" | "Create account" |
| Signup, below form (new callout) | — | "Applied for a job? You don't need an account yet. We'll reach out after we review your application." |
| Login (`LoginForm.tsx`) | "Need an account? Create one" | "Have a team code? Create your account" |

`PendingApproval.tsx` is unchanged.

## Part 3 — Easy path to login

### Short URLs

`next.config` gains permanent redirects:

| Source | Destination |
|---|---|
| `/login` | `/portal` |
| `/signin` | `/portal` |
| `/employee` | `/portal` |

`/portal` already renders the login form when signed out and redirects to the
dashboard when signed in.

### Add-to-home-screen banner

- New component `src/components/portal/AddToHomeScreenBanner.tsx`, rendered
  at the top of the portal dashboard page only.
- Shows only when all are true: user agent is iOS Safari (iPhone/iPad, not
  Chrome/Firefox iOS wrappers), `window.navigator.standalone` is falsy (not
  already installed), and `localStorage["a2hs-dismissed"]` is unset.
- Copy: title "Add 3C Console to your home screen", body "Tap the Share
  button, then Add to Home Screen. You'll get an app icon that opens straight
  to the portal.", one button "Got it" that sets the localStorage flag and
  hides the banner.
- All localStorage access wrapped in try/catch; on any error the banner does
  not render.
- Styled with the existing portal palette; respects the 59px iOS safe-area
  inset rule from the device baseline.

## Testing

- Unit: team-code route returns ok only for a case-insensitive trimmed match,
  fails closed when env is unset (vitest, mock `process.env`).
- Unit: banner visibility predicate (pure function taking UA string,
  standalone flag, dismissed flag) covered for the four combinations.
- Manual: signup with wrong code blocked, right code succeeds and Pending
  queue shows the user; `/login`, `/signin`, `/employee` redirect on prod;
  banner shows once on an iPhone in Safari and never inside the installed app.
- Gates before merge: `npx tsc --noEmit`, `npm run build`.

## Rollout

1. Deploy code with `PORTAL_TEAM_CODE` set in Vercel.
2. Jacob tells managers the code and the `3cworldgroup.com/login` URL.
3. Delete the remaining bot account from the Pending queue (already pending
   on Jacob).
