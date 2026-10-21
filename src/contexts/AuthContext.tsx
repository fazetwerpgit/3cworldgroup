'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, DocumentData } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { isAwaitingRoleAssignment } from '@/lib/auth/pendingApproval';
import { clearSignature } from '@/components/esign/signatureStore';
import { ASK_CONVERSATION_KEY } from '@/lib/ask/chat';
import { PRACTICE_SESSION_KEY } from '@/lib/ask/practiceSessionKey';
import { ProfileLoadRetry } from '@/components/auth/ProfileLoadRetry';
import { unregisterPushOnDevice } from '@/lib/push/enablePushOnDevice';
import { takePendingDisplayName } from '@/lib/app/nativeAuth';
import { clearPendingIdToken, rememberPendingIdToken } from '@/lib/auth/pendingSession';
import { unregisterNativePush } from '@/lib/app/nativePush';
import { clearViewAs } from '@/lib/viewAs/storage';
import { User, AuthState, UserRole, isOwner, permissionsFor, resolveRoles, isSolarRole, isMainLine } from '@/types';
import { setDataCacheOwner } from '@/lib/cache/dataCache';
import { clearDashboardSnapshots } from '@/lib/cache/dashboardSnapshot';
import { clearSessionProfile, readSessionProfile, writeSessionProfile } from '@/lib/auth/sessionProfile';
import { preloadOwnerDashboard } from '@/components/portal/owner/preloadOwnerDashboard';

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, teamCode: string, inviteToken?: string, captchaPass?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isRole: (...roles: UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
  clearPendingApproval: () => void;
  // True when the Firebase session is valid but the profile read kept failing
  // (weak signal / Firestore offline). The session is kept; the provider shows
  // a retry screen instead of signing the rep out.
  profileLoadFailed: boolean;
  retryProfileLoad: () => Promise<void>;
  // True once the user on screen came from a real read of users/{uid} for the
  // confirmed session. False while the portal paints from the profile this
  // device remembered (sessionProfile.ts): role-based redirects wait for it.
  profileVerified: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type FetchUserDataResult =
  | { status: 'found'; user: User }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

const missingProfileMessage = 'User profile not found. Please contact an administrator.';
const appleNoEmailMessage =
  "Your Apple ID didn't share an email address, so we can't set up your account. Use Google or your company email instead.";
// Same words Firebase's auth/user-disabled maps to: deactivating also disables the auth account.
const disabledAccountMessage = 'This account has been disabled. Contact your manager.';
const profileLoadErrorMessage =
  'We could not load your profile. This is usually weak signal — you are still signed in, so just try again.';

// Waits between automatic profile-read attempts (3 attempts total). A transient
// read failure must never sign the rep out: on a weak cell signal Firestore
// reports "client is offline"/unavailable, which says nothing about the account.
const PROFILE_RETRY_DELAYS_MS = [1000, 3000];
// When the remembered profile is already on screen and the read still fails,
// the rep keeps working and the read is retried quietly on this backoff (the
// last wait repeats), as well as on 'online' and by the live profile listener.
const QUIET_PROFILE_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Per-tab state that belongs to the account signed in on this device. Every
// path to a signed-out state drops it (an explicit sign-out, a forced one on
// deactivation, or Firebase ending the session itself) so a shared phone or
// the iOS app's long-lived WebView never hands it to whoever signs in next.
function clearDeviceSession() {
  // The e-sign signature lives in sessionStorage for reuse across the five
  // onboarding documents, under one key for everybody.
  clearSignature();
  // The owner's "View as rep" session ends with the sign-in it belongs to.
  clearViewAs();
  // Same for the Ask 3C conversation and practice: the next rep must not see or send them.
  try {
    window.sessionStorage.removeItem(ASK_CONVERSATION_KEY);
    window.sessionStorage.removeItem(PRACTICE_SESSION_KEY);
  } catch {
    // Storage blocked: the page's uid check still keeps it from the next rep.
  }
}

// Removes this device's push registration while the session can still prove
// who it belongs to (the route needs the ID token). Capped so a rep on weak
// signal never waits on it: after 2.5s it lets the request finish in the background.
async function unregisterPushCapped() {
  const cap = Promise.withResolvers<void>();
  setTimeout(cap.resolve, 2500);
  await Promise.race([Promise.all([unregisterPushOnDevice(), unregisterNativePush()]), cap.promise]);
}

// Best-effort, fire-and-forget: copies a Google SSO photoURL onto the caller's
// own users doc via a server route that verifies the ID token and derives both
// the target uid and the photo server-side (never trusts client input). Only
// called when the client already sees a mismatch, so this is cheap on repeat
// logins. Any failure is swallowed — a sync hiccup must never block sign-in.
function syncAvatarFromAuth(firebaseUser: FirebaseUser) {
  if (!firebaseUser.photoURL) return;
  void firebaseUser
    .getIdToken()
    .then((token) =>
      fetch('/api/portal/auth/sync-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    .catch(() => {});
}

// Fire-and-forget owner alert for a new pending self-signup. The route reads
// the uid from the ID token, never from the body. A team-code signup sends its
// code (checked server-side); the Google first sign-in sends none and is
// accepted by its google.com sign-in provider. A password signup also sends the
// captcha pass the signup form earned. The token is fetched before the
// caller signs out.
async function notifyPendingSignup(firebaseUser: FirebaseUser, gate?: { code: string; inviteToken?: string; captchaPass?: string }) {
  try {
    const idToken = await firebaseUser.getIdToken();
    void fetch('/api/portal/auth/signup-notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(gate !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(gate !== undefined ? { body: JSON.stringify(gate) } : {}),
    }).catch(() => {});
  } catch {
    // Best-effort: a missed alert must never fail the signup.
  }
}

// Keeps the pending account's ID token (memory only) so the pending screen
// can still send "Delete my request" after the sign-out. Best-effort.
async function parkPendingIdToken(firebaseUser: FirebaseUser) {
  try {
    rememberPendingIdToken(await firebaseUser.getIdToken());
  } catch {
    rememberPendingIdToken(null);
  }
}

function toUser(uid: string, userData: DocumentData): User {
  return {
    uid,
    email: userData.email,
    displayName: userData.displayName,
    ...resolveRoles(userData.role, userData.fieldRole),
    solarRole: isSolarRole(userData.solarRole) ? userData.solarRole : null,
    mainLine: isMainLine(userData.mainLine) ? userData.mainLine : null,
    isIBO: userData.isIBO ?? false,
    // TODO: migrate Firestore managerId -> reportsToId
    reportsToId: userData.reportsToId ?? userData.managerId,
    territoryId: userData.territoryId,
    phone: userData.phone,
    address: userData.address,
    city: userData.city,
    state: userData.state,
    zip: userData.zip,
    shirtSize: userData.shirtSize,
    avatarUrl: userData.avatarUrl,
    status: userData.status,
    hireDate: userData.hireDate?.toDate(),
    createdAt: userData.createdAt?.toDate(),
    updatedAt: userData.updatedAt?.toDate(),
    pushRequired: userData.pushRequired === true,
    demoAccount: userData.demoAccount === true,
  } as User;
}

// Lets the profile listener skip a snapshot that changes nothing the app sees,
// so `user` keeps its identity and no effect keyed on it re-runs.
function sameUser(a: User, b: User): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof User>;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    const equal = x instanceof Date && y instanceof Date ? x.getTime() === y.getTime() : x === y;
    if (!equal) return false;
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    pendingApproval: false,
  });

  // While a client-side signup is running, ignore onAuthStateChanged churn so
  // signUp() deterministically owns the final state (avoids a create→setDoc race).
  const signingUp = useRef(false);
  const bootstrappingPendingProfile = useRef(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  // Bumped on every auth-state resolution so a slow, retried profile read never
  // overwrites the state of a newer sign-in/sign-out.
  const resolveGeneration = useRef(0);
  const resolveProfileRef = useRef<((firebaseUser: FirebaseUser) => Promise<void>) | null>(null);
  const profileLoadFailedRef = useRef(false);
  // The one live listener on the signed-in user's own users doc.
  const profileUnsubscribe = useRef<(() => void) | null>(null);
  // The account the auth listener last saw on this tab: a change away from it
  // (to none or to someone else) clears that account's per-tab state.
  const lastAuthUid = useRef<string | null>(null);
  useEffect(() => {
    profileLoadFailedRef.current = profileLoadFailed;
  }, [profileLoadFailed]);
  // True once the user on screen came from a real read of users/{uid} for the
  // confirmed session (not the device's remembered copy). The ref is what the
  // auth listener reads; the state is what consumers (useRequireAuth) see.
  const profileVerifiedRef = useRef(false);
  const [profileVerified, setProfileVerifiedState] = useState(false);
  const markProfileVerified = useCallback((verified: boolean) => {
    profileVerifiedRef.current = verified;
    setProfileVerifiedState(verified);
  }, []);
  // The user currently on screen, for the auth listener (its closure is stale).
  const shownUser = useRef<User | null>(null);
  useEffect(() => {
    shownUser.current = state.user;
  }, [state.user]);
  // Quiet retry of the profile read while the remembered profile stays up.
  const quietRetry = useRef<{ timer: ReturnType<typeof setTimeout> | null; attempt: number } | null>(null);
  const cancelQuietRetry = useCallback(() => {
    if (quietRetry.current?.timer) clearTimeout(quietRetry.current.timer);
    quietRetry.current = null;
  }, []);

  // Owners land on the company view: fetch its chunk as soon as a profile
  // (the remembered one at mount, then the real one) says owner.
  useEffect(() => {
    if (isOwner(readSessionProfile()?.role)) preloadOwnerDashboard();
  }, []);
  useEffect(() => {
    if (isOwner(state.user?.role)) preloadOwnerDashboard();
  }, [state.user?.role]);

  // Keep the remembered copy in step with the confirmed profile; drop it when
  // the session ends or resolves to anything but this account. A profile read
  // that failed on weak signal (the retry screen) keeps it: the session stands.
  useEffect(() => {
    if (state.loading || profileLoadFailed) return;
    if (state.user) {
      if (profileVerified) writeSessionProfile(state.user);
    } else {
      clearSessionProfile();
      clearDashboardSnapshots();
    }
  }, [state.user, state.loading, profileLoadFailed, profileVerified]);

  const fetchUserData = async (firebaseUser: FirebaseUser): Promise<FetchUserDataResult> => {
    if (!db) return { status: 'error', error: new Error('Firestore is not configured') };
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        return { status: 'found', user: toUser(firebaseUser.uid, userDoc.data()) };
      }
      return { status: 'missing' };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { status: 'error', error };
    }
  };

  useEffect(() => {
    // If Firebase isn't configured, just set loading to false
    if (!isFirebaseConfigured() || !auth || !db) {
      setState({
        user: null,
        loading: false,
        error: 'Firebase is not configured. Please set up your environment variables.',
        pendingApproval: false,
      });
      return;
    }

    const firestore = db;

    const fetchUserDataWithRetry = async (
      firebaseUser: FirebaseUser,
      generation: number
    ): Promise<FetchUserDataResult | null> => {
      let result = await fetchUserData(firebaseUser);
      for (const delay of PROFILE_RETRY_DELAYS_MS) {
        if (result.status !== 'error') break;
        await wait(delay);
        if (generation !== resolveGeneration.current) return null;
        result = await fetchUserData(firebaseUser);
      }
      return generation === resolveGeneration.current ? result : null;
    };

    const stopWatchingProfile = () => {
      profileUnsubscribe.current?.();
      profileUnsubscribe.current = null;
    };

    // An account the portal turns away (deactivated, or still waiting on a
    // role) gets the same device cleanup as signOut(): its push registration
    // goes while the ID token can still prove whose it is, then its per-tab state.
    const forceSignOut = async () => {
      clearDeviceSession();
      if (!auth) return;
      await unregisterPushCapped();
      await firebaseSignOut(auth);
    };

    // After the profile resolves to a signed-in state, keep listening so an
    // admin's change (deactivation, activation, a new role) reaches an open tab.
    const watchProfile = (uid: string) => {
      stopWatchingProfile();
      profileUnsubscribe.current = onSnapshot(
        doc(firestore, 'users', uid),
        (snap) => {
          // A cache-only or missing snapshot says nothing about the account
          // (weak signal); the initial read already handled a missing profile.
          if (snap.metadata.fromCache || !snap.exists()) return;
          const next = toUser(uid, snap.data());
          if (next.status === 'active' || (next.status === 'pending' && !isAwaitingRoleAssignment(next))) {
            // A server snapshot is a real read: it verifies a remembered
            // profile kept up through a failed read and ends the quiet retry.
            if (shownUser.current?.uid === uid) {
              cancelQuietRetry();
              markProfileVerified(true);
            }
            setState((prev) =>
              prev.user?.uid === uid && !sameUser(prev.user, next) ? { ...prev, user: next } : prev
            );
            return;
          }
          stopWatchingProfile();
          cancelQuietRetry();
          resolveGeneration.current += 1;
          void (async () => {
            await forceSignOut();
            setState({ user: null, loading: false, error: disabledAccountMessage, pendingApproval: false });
          })();
        },
        (error) => console.warn('User profile listener stopped:', error)
      );
    };

    const scheduleQuietRetry = (firebaseUser: FirebaseUser) => {
      const attempt = quietRetry.current ? quietRetry.current.attempt + 1 : 0;
      if (quietRetry.current?.timer) clearTimeout(quietRetry.current.timer);
      const delay = QUIET_PROFILE_RETRY_DELAYS_MS[Math.min(attempt, QUIET_PROFILE_RETRY_DELAYS_MS.length - 1)];
      const generation = resolveGeneration.current;
      const timer = setTimeout(() => {
        if (quietRetry.current) quietRetry.current.timer = null;
        if (generation !== resolveGeneration.current) return;
        if (auth?.currentUser?.uid !== firebaseUser.uid) return;
        void resolveProfileRef.current?.(firebaseUser);
      }, delay);
      quietRetry.current = { timer, attempt };
    };

    const resolveProfile = async (firebaseUser: FirebaseUser) => {
      const generation = ++resolveGeneration.current;
      stopWatchingProfile();
      if (quietRetry.current?.timer) {
        clearTimeout(quietRetry.current.timer);
        quietRetry.current.timer = null;
      }
      const userDataResult = await fetchUserDataWithRetry(firebaseUser, generation);
      if (!userDataResult) return; // superseded by a newer auth event
      if (userDataResult.status === 'error' && shownUser.current?.uid === firebaseUser.uid) {
        // The remembered (or an earlier) profile for this same account is on
        // screen and the read only failed (weak signal): keep the rep working.
        // No retry screen, no sign-out; retry quietly on a backoff, on
        // 'online', and through the live listener's first server snapshot.
        console.warn('User profile read failed; keeping the profile on screen:', userDataResult.error);
        watchProfile(firebaseUser.uid);
        scheduleQuietRetry(firebaseUser);
        return;
      }
      cancelQuietRetry();
      if (userDataResult.status !== 'error') setProfileLoadFailed(false);
      markProfileVerified(userDataResult.status === 'found');
      if (userDataResult.status === 'found') {
        const userData = userDataResult.user;
        if (userData.status === 'active') {
          // The confirmed profile usually equals the remembered one already on
          // screen: keep that object so effects keyed on `user` don't re-run
          // (Sales and Leaderboard used to fetch twice on every cold open).
          setState((prev) => ({
            user: prev.user && sameUser(prev.user, userData) ? prev.user : userData,
            loading: false,
            error: null,
            pendingApproval: false,
          }));
          watchProfile(firebaseUser.uid);
          // Only fires when the client already sees the Auth photo differs from
          // the stored one, so a normal login makes zero extra calls once synced.
          if (firebaseUser.photoURL && firebaseUser.photoURL !== userData.avatarUrl) {
            syncAvatarFromAuth(firebaseUser);
          }
        } else if (isAwaitingRoleAssignment(userData)) {
          await parkPendingIdToken(firebaseUser);
          await forceSignOut();
          setState({ user: null, loading: false, error: null, pendingApproval: true });
        } else if (userData.status === 'pending') {
          // The confirmed profile usually equals the remembered one already on
          // screen: keep that object so effects keyed on `user` don't re-run
          // (Sales and Leaderboard used to fetch twice on every cold open).
          setState((prev) => ({
            user: prev.user && sameUser(prev.user, userData) ? prev.user : userData,
            loading: false,
            error: null,
            pendingApproval: false,
          }));
          watchProfile(firebaseUser.uid);
        } else {
          await forceSignOut();
          setState({
            user: null,
            loading: false,
            error: disabledAccountMessage,
            pendingApproval: false,
          });
        }
      } else if (userDataResult.status === 'missing') {
        if (firebaseUser.email) {
          bootstrappingPendingProfile.current = true;
          // A first sign-in with Google or Apple (no team code, no signup
          // form): keep the provider's name and raise the same owner alert a
          // signup does. Apple shares a name only on the first authorization
          // (parked by the in-app sign-in) and may share a private-relay email
          // or no name at all; both are fine here, displayName is optional.
          const appleName = takePendingDisplayName();
          const googleName = (firebaseUser.displayName?.trim() || appleName)?.slice(0, 100);
          try {
            // firestore.rules: exactly these keys, and the email must be this
            // account's own sign-in address.
            await setDoc(doc(firestore, 'users', firebaseUser.uid), {
              email: firebaseUser.email.toLowerCase(),
              ...(googleName ? { displayName: googleName } : {}),
              status: 'pending',
              createdAt: serverTimestamp(),
            });
            await notifyPendingSignup(firebaseUser);
            await parkPendingIdToken(firebaseUser);
            if (auth) await firebaseSignOut(auth);
            setState({ user: null, loading: false, error: null, pendingApproval: true });
          } catch (profileError) {
            console.error('Error creating pending user profile:', profileError);
            if (auth) await firebaseSignOut(auth);
            setState({
              user: null,
              loading: false,
              error: missingProfileMessage,
              pendingApproval: false,
            });
          } finally {
            bootstrappingPendingProfile.current = false;
          }
        } else {
          if (auth) await firebaseSignOut(auth);
          // firestore.rules needs the sign-in email on the pending doc; an
          // Apple ID that shared none cannot start an account.
          const viaApple = firebaseUser.providerData.some((info) => info.providerId === 'apple.com');
          setState({
            user: null,
            loading: false,
            error: viaApple ? appleNoEmailMessage : missingProfileMessage,
            pendingApproval: false,
          });
        }
      } else {
        // Transient failure (offline, unavailable, network): keep the Firebase
        // session and let the rep retry instead of signing them out.
        console.error('User profile read failed after retries:', userDataResult.error);
        setProfileLoadFailed(true);
        setState({
          user: null,
          loading: false,
          error: profileLoadErrorMessage,
          pendingApproval: false,
        });
      }
    };
    resolveProfileRef.current = resolveProfile;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Cached screens belong to one account: another account, or none, empties them.
      setDataCacheOwner(firebaseUser?.uid ?? null);
      // Firebase can end a session on its own (auth account disabled or
      // deleted, refresh token revoked) or switch accounts; the per-tab state of
      // the account that left goes with it. Only a change away from an account
      // seen on this tab counts: a cold open with no session (a new hire on an
      // /onboard link) keeps its own signature.
      const previousUid = lastAuthUid.current;
      lastAuthUid.current = firebaseUser?.uid ?? null;
      if (previousUid !== null && previousUid !== lastAuthUid.current) clearDeviceSession();
      if (signingUp.current || bootstrappingPendingProfile.current) return; // explicit auth flows own state
      if (firebaseUser) {
        // Cold open: Firebase has restored and checked this session. Paint the
        // portal now with the profile this device remembered for this same
        // account (sessionProfile.ts) instead of holding the splash for the
        // Firestore read below, which then replaces it (or signs out). The
        // user only appears once auth.currentUser is set, as before.
        const remembered = readSessionProfile();
        if (remembered?.uid === firebaseUser.uid) {
          setState((prev) =>
            prev.user ? prev : { user: remembered, loading: false, error: null, pendingApproval: false }
          );
        }
        await resolveProfile(firebaseUser);
      } else {
        resolveGeneration.current += 1;
        markProfileVerified(false);
        cancelQuietRetry();
        clearSessionProfile();
        clearDashboardSnapshots();
        stopWatchingProfile();
        setProfileLoadFailed(false);
        // Preserve pendingApproval so the pending screen survives the sign-out.
        setState((prev) => ({ ...prev, user: null, loading: false, error: null }));
      }
    });

    // Coming back into signal is the most likely moment a retry succeeds.
    const handleOnline = () => {
      const currentUser = auth?.currentUser;
      if (currentUser && resolveProfileRef.current && (profileLoadFailedRef.current || quietRetry.current)) {
        void resolveProfileRef.current(currentUser);
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      stopWatchingProfile();
      cancelQuietRetry();
      window.removeEventListener('online', handleOnline);
    };
  }, [cancelQuietRetry, markProfileVerified]);

  const retryProfileLoad = async () => {
    const currentUser = auth?.currentUser;
    if (!currentUser || !resolveProfileRef.current) {
      setProfileLoadFailed(false);
      setState((prev) => ({ ...prev, user: null, loading: false, error: null }));
      return;
    }
    await resolveProfileRef.current(currentUser);
  };

  const signIn = async (email: string, password: string) => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured');
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: unknown) {
      setState((prev) => ({ ...prev, loading: false, error: friendlyAuthError(error) }));
      throw error;
    }
  };

  const signUp = async (email: string, password: string, displayName: string, teamCode: string, inviteToken?: string, captchaPass?: string) => {
    if (!auth || !db) throw new Error('auth/not-configured');
    signingUp.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await updateProfile(cred.user, { displayName });
      } catch (profileError) {
        console.warn('Failed to set auth displayName:', profileError);
      }
      try {
        // Exactly the keys firestore.rules lets a client create users/{uid}
        // with (hasOnly email/displayName/status/createdAt): any extra field
        // is denied and the new account is rolled back. The email must match
        // the account's sign-in address.
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: email.toLowerCase(),
          displayName,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        await notifyPendingSignup(cred.user, {
          code: teamCode,
          ...(inviteToken ? { inviteToken } : {}),
          ...(captchaPass ? { captchaPass } : {}),
        });
      } catch (docError) {
        // Roll back the just-created auth account so the profile write can be
        // retried cleanly instead of failing with email-already-in-use.
        try {
          await cred.user.delete();
        } catch {
          if (auth) await firebaseSignOut(auth);
        }
        throw docError;
      }
      try {
        await sendEmailVerification(cred.user, { url: `${window.location.origin}/portal` });
      } catch (verificationError) {
        console.warn('Failed to send verification email:', verificationError);
      }
      await parkPendingIdToken(cred.user);
      await firebaseSignOut(auth);
      setState({ user: null, loading: false, error: null, pendingApproval: true });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    } finally {
      signingUp.current = false;
    }
  };

  // Let the pending screen return to the login form without a page reload.
  const clearPendingApproval = () => {
    clearPendingIdToken();
    setState((prev) => ({ ...prev, pendingApproval: false }));
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured');
    }
    try {
      // Signature, View as, Ask conversation: see clearDeviceSession.
      clearDeviceSession();
      // Cached screens (an owner's include financials) never outlive the sign-in.
      setDataCacheOwner(null);
      // Nor does the remembered profile: the next open starts at the sign-in.
      markProfileVerified(false);
      cancelQuietRetry();
      clearSessionProfile();
      // And the dashboard kept on the device for fast cold opens.
      clearDashboardSnapshots();
      // Started before sign-out (it reads this user's ID token first).
      await unregisterPushCapped();
      await firebaseSignOut(auth);
      setProfileLoadFailed(false);
      setState({ user: null, loading: false, error: null, pendingApproval: false });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign out';
      setState((prev) => ({ ...prev, error: errorMessage }));
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured');
    }
    await sendPasswordResetEmail(auth, email);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!auth || !auth.currentUser) {
      throw new Error('You must be signed in to change your password');
    }

    const user = auth.currentUser;
    if (!user.email) {
      throw new Error('No email associated with this account');
    }

    // Re-authenticate the user with their current password
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update to new password
    await updatePassword(user, newPassword);
  };

  const refreshUser = async () => {
    if (!auth) return;
    const currentUser = auth.currentUser;
    if (currentUser) {
      const userDataResult = await fetchUserData(currentUser);
      if (userDataResult.status === 'found') {
        markProfileVerified(true);
        setState((prev) => ({ ...prev, user: userDataResult.user }));
      }
    }
  };

  // The role's permissions plus the solar role's (permissionsFor).
  const hasPermission = (permission: string): boolean => permissionsFor(state.user).includes(permission);

  // An owner satisfies a check for 'admin' as well as for 'owner': the tier sits
  // above admin, so every isRole('admin') call site in the portal admits it
  // without each one having to name both roles.
  const isRole = (...roles: UserRole[]): boolean => {
    if (!state.user) return false;
    const { role, fieldRole } = state.user;
    if (roles.some((r) => r === role || r === fieldRole)) return true;
    return isOwner(role) && roles.includes('admin');
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        resetPassword,
        changePassword,
        hasPermission,
        isRole,
        refreshUser,
        clearPendingApproval,
        profileLoadFailed,
        retryProfileLoad,
        profileVerified,
      }}
    >
      {profileLoadFailed ? (
        <ProfileLoadRetry
          message={state.error ?? profileLoadErrorMessage}
          onRetry={retryProfileLoad}
          onSignOut={signOut}
        />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

/** A read permission ('sales:read', 'sales:read:all'): anything else can write. */
export function isReadPermission(permission: string): boolean {
  return permission.split(':')[1] === 'read';
}

/**
 * "View as rep": re-provides auth to the rep screens with the REP as the user,
 * so every `useAuth()` below renders the rep's view (their uid, role and
 * permissions). READ ONLY: hasPermission answers only read permissions, so
 * every control gated on a write permission (Log sale, bulk log, delete...)
 * disappears. Sign-out and the Firebase session stay the owner's own; the
 * data itself is the rep's because ViewAsScope tags the screens' reads.
 */
export function AuthSubjectProvider({ user, children }: { user: User; children: ReactNode }) {
  const parent = useAuth();
  const value = useMemo(() => subjectAuthValue(parent, user), [parent, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The auth value the rep screens see while the owner views as `user` (read only). */
export function subjectAuthValue(parent: AuthContextType, user: User): AuthContextType {
  const permissions = permissionsFor(user);
  return {
    ...parent,
    user,
    pendingApproval: false,
    hasPermission: (permission: string) => isReadPermission(permission) && permissions.includes(permission),
    isRole: (...roles: UserRole[]) =>
      roles.some((r) => r === user.role || r === user.fieldRole) || (isOwner(user.role) && roles.includes('admin')),
  };
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
