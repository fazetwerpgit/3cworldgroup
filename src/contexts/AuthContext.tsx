'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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
import { PRACTICE_SESSION_KEY } from '@/lib/ask/practice';
import { ProfileLoadRetry } from '@/components/auth/ProfileLoadRetry';
import { unregisterPushOnDevice } from '@/lib/push/enablePushOnDevice';
import { User, AuthState, RolePermissions, UserRole, isOwner, resolveRoles } from '@/types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, teamCode: string) => Promise<void>;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type FetchUserDataResult =
  | { status: 'found'; user: User }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

const missingProfileMessage = 'User profile not found. Please contact an administrator.';
// Same words Firebase's auth/user-disabled maps to: deactivating also disables the auth account.
const disabledAccountMessage = 'This account has been disabled. Contact your manager.';
const profileLoadErrorMessage =
  'We could not load your profile. This is usually weak signal — you are still signed in, so just try again.';

// Waits between automatic profile-read attempts (3 attempts total). A transient
// read failure must never sign the rep out: on a weak cell signal Firestore
// reports "client is offline"/unavailable, which says nothing about the account.
const PROFILE_RETRY_DELAYS_MS = [1000, 3000];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
// accepted by its google.com sign-in provider. The token is fetched before the
// caller signs out.
async function notifyPendingSignup(firebaseUser: FirebaseUser, teamCode?: string) {
  try {
    const idToken = await firebaseUser.getIdToken();
    void fetch('/api/portal/auth/signup-notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(teamCode !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(teamCode !== undefined ? { body: JSON.stringify({ code: teamCode }) } : {}),
    }).catch(() => {});
  } catch {
    // Best-effort: a missed alert must never fail the signup.
  }
}

function toUser(uid: string, userData: DocumentData): User {
  return {
    uid,
    email: userData.email,
    displayName: userData.displayName,
    ...resolveRoles(userData.role, userData.fieldRole),
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
  useEffect(() => {
    profileLoadFailedRef.current = profileLoadFailed;
  }, [profileLoadFailed]);

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
            setState((prev) =>
              prev.user?.uid === uid && !sameUser(prev.user, next) ? { ...prev, user: next } : prev
            );
            return;
          }
          stopWatchingProfile();
          resolveGeneration.current += 1;
          void (async () => {
            if (auth) await firebaseSignOut(auth);
            setState({ user: null, loading: false, error: disabledAccountMessage, pendingApproval: false });
          })();
        },
        (error) => console.warn('User profile listener stopped:', error)
      );
    };

    const resolveProfile = async (firebaseUser: FirebaseUser) => {
      const generation = ++resolveGeneration.current;
      stopWatchingProfile();
      const userDataResult = await fetchUserDataWithRetry(firebaseUser, generation);
      if (!userDataResult) return; // superseded by a newer auth event
      if (userDataResult.status !== 'error') setProfileLoadFailed(false);
      if (userDataResult.status === 'found') {
        const userData = userDataResult.user;
        if (userData.status === 'active') {
          setState({ user: userData, loading: false, error: null, pendingApproval: false });
          watchProfile(firebaseUser.uid);
          // Only fires when the client already sees the Auth photo differs from
          // the stored one, so a normal login makes zero extra calls once synced.
          if (firebaseUser.photoURL && firebaseUser.photoURL !== userData.avatarUrl) {
            syncAvatarFromAuth(firebaseUser);
          }
        } else if (isAwaitingRoleAssignment(userData)) {
          if (auth) await firebaseSignOut(auth);
          setState({ user: null, loading: false, error: null, pendingApproval: true });
        } else if (userData.status === 'pending') {
          setState({ user: userData, loading: false, error: null, pendingApproval: false });
          watchProfile(firebaseUser.uid);
        } else {
          if (auth) await firebaseSignOut(auth);
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
          // A first sign-in with Google (no team code, no signup form): keep
          // the Google name and raise the same owner alert a signup does.
          const googleName = firebaseUser.displayName?.trim().slice(0, 100);
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
          setState({
            user: null,
            loading: false,
            error: missingProfileMessage,
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
      if (signingUp.current || bootstrappingPendingProfile.current) return; // explicit auth flows own state
      if (firebaseUser) {
        await resolveProfile(firebaseUser);
      } else {
        resolveGeneration.current += 1;
        stopWatchingProfile();
        setProfileLoadFailed(false);
        // Preserve pendingApproval so the pending screen survives the sign-out.
        setState((prev) => ({ ...prev, user: null, loading: false, error: null }));
      }
    });

    // Coming back into signal is the most likely moment a retry succeeds.
    const handleOnline = () => {
      const currentUser = auth?.currentUser;
      if (currentUser && resolveProfileRef.current && profileLoadFailedRef.current) {
        void resolveProfileRef.current(currentUser);
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      stopWatchingProfile();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

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

  const signUp = async (email: string, password: string, displayName: string, teamCode: string) => {
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
        await notifyPendingSignup(cred.user, teamCode);
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
    setState((prev) => ({ ...prev, pendingApproval: false }));
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured');
    }
    try {
      // The e-sign signature lives in sessionStorage for reuse across the five
      // onboarding documents. Drop it here so a shared phone never hands one
      // rep's signature to whoever signs in next.
      clearSignature();
      // Same for the Ask 3C conversation and practice: the next rep must not see or send them.
      try {
        window.sessionStorage.removeItem(ASK_CONVERSATION_KEY);
        window.sessionStorage.removeItem(PRACTICE_SESSION_KEY);
      } catch {
        // Storage blocked: the page's uid check still keeps it from the next rep.
      }
      // Started before sign-out (it reads this user's ID token first), but a
      // rep on weak signal shouldn't wait on it: after 2.5s sign out anyway and
      // let the request finish in the background.
      const cap = Promise.withResolvers<void>();
      setTimeout(cap.resolve, 2500);
      await Promise.race([unregisterPushOnDevice(), cap.promise]);
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
        setState((prev) => ({ ...prev, user: userDataResult.user }));
      }
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!state.user) return false;
    const roleKey = state.user.role ?? state.user.fieldRole;
    const permissions = roleKey ? RolePermissions[roleKey] : [];
    return permissions.includes(permission);
  };

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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
