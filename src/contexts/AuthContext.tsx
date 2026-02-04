'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase/config';
import { User, AuthState, RolePermissions, UserRole } from '@/types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isRole: (...roles: UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const fetchUserData = async (firebaseUser: FirebaseUser): Promise<User | null> => {
    if (!db) return null;
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          uid: firebaseUser.uid,
          email: userData.email,
          displayName: userData.displayName,
          role: userData.role,
          managerId: userData.managerId,
          territoryId: userData.territoryId,
          phone: userData.phone,
          avatarUrl: userData.avatarUrl,
          status: userData.status,
          hireDate: userData.hireDate?.toDate(),
          createdAt: userData.createdAt?.toDate(),
          updatedAt: userData.updatedAt?.toDate(),
        } as User;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  };

  useEffect(() => {
    // If Firebase isn't configured, just set loading to false
    if (!isFirebaseConfigured() || !auth) {
      setState({
        user: null,
        loading: false,
        error: 'Firebase is not configured. Please set up your environment variables.',
      });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await fetchUserData(firebaseUser);
        if (userData) {
          if (userData.status !== 'active') {
            setState({
              user: null,
              loading: false,
              error: 'Your account is not active. Please contact an administrator.',
            });
            if (auth) await firebaseSignOut(auth);
          } else {
            setState({
              user: userData,
              loading: false,
              error: null,
            });
          }
        } else {
          setState({
            user: null,
            loading: false,
            error: 'User profile not found. Please contact an administrator.',
          });
        }
      } else {
        setState({ user: null, loading: false, error: null });
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured');
    }
    try {
      await firebaseSignOut(auth);
      setState({ user: null, loading: false, error: null });
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

  const refreshUser = async () => {
    if (!auth) return;
    const currentUser = auth.currentUser;
    if (currentUser) {
      const userData = await fetchUserData(currentUser);
      if (userData) {
        setState((prev) => ({ ...prev, user: userData }));
      }
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!state.user) return false;
    const permissions = RolePermissions[state.user.role] || [];
    return permissions.includes(permission);
  };

  const isRole = (...roles: UserRole[]): boolean => {
    if (!state.user) return false;
    return roles.includes(state.user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signOut,
        resetPassword,
        hasPermission,
        isRole,
        refreshUser,
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
