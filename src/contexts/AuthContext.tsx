'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { User, AuthState, RolePermissions, UserRole, resolveRoles } from '@/types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isRole: (...roles: UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
  clearPendingApproval: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type FetchUserDataResult =
  | { status: 'found'; user: User }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

const missingProfileMessage = 'User profile not found. Please contact an administrator.';
const profileLoadErrorMessage = 'We could not load your profile. Please try signing in again.';

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

  const fetchUserData = async (firebaseUser: FirebaseUser): Promise<FetchUserDataResult> => {
    if (!db) return { status: 'error', error: new Error('Firestore is not configured') };
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          status: 'found',
          user: {
            uid: firebaseUser.uid,
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
            avatarUrl: userData.avatarUrl,
            status: userData.status,
            hireDate: userData.hireDate?.toDate(),
            createdAt: userData.createdAt?.toDate(),
            updatedAt: userData.updatedAt?.toDate(),
          } as User,
        };
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

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (signingUp.current || bootstrappingPendingProfile.current) return; // explicit auth flows own state
      if (firebaseUser) {
        const userDataResult = await fetchUserData(firebaseUser);
        if (userDataResult.status === 'found') {
          const userData = userDataResult.user;
          if (userData.status === 'active') {
            setState({ user: userData, loading: false, error: null, pendingApproval: false });
          } else if (userData.status === 'pending') {
            if (auth) await firebaseSignOut(auth);
            setState({ user: null, loading: false, error: null, pendingApproval: true });
          } else {
            if (auth) await firebaseSignOut(auth);
            setState({
              user: null,
              loading: false,
              error: 'Your account has been deactivated. Please contact an administrator.',
              pendingApproval: false,
            });
          }
        } else if (userDataResult.status === 'missing') {
          if (firebaseUser.email) {
            bootstrappingPendingProfile.current = true;
            try {
              await setDoc(doc(firestore, 'users', firebaseUser.uid), {
                email: firebaseUser.email,
                status: 'pending',
                createdAt: serverTimestamp(),
              });
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
          console.error('User profile read failed:', userDataResult.error);
          if (auth) await firebaseSignOut(auth);
          setState({
            user: null,
            loading: false,
            error: profileLoadErrorMessage,
            pendingApproval: false,
          });
        }
      } else {
        // Preserve pendingApproval so the pending screen survives the sign-out.
        setState((prev) => ({ ...prev, user: null, loading: false, error: null }));
      }
    });

    return () => unsubscribe();
  }, []);

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

  const signUp = async (email: string, password: string) => {
    if (!auth || !db) throw new Error('auth/not-configured');
    signingUp.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        void fetch('/api/portal/auth/signup-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: cred.user.uid }),
        }).catch(() => {});
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
      await firebaseSignOut(auth);
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

  const isRole = (...roles: UserRole[]): boolean => {
    if (!state.user) return false;
    const { role, fieldRole } = state.user;
    return roles.some((r) => r === role || r === fieldRole);
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
      }}
    >
      {children}
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
