'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

type FormMode = 'login' | 'forgot';

export function LoginForm() {
  const { signIn, error: authError, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('login');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: unknown) {
      // Error is already handled in AuthContext
      if (err instanceof Error) {
        // Map Firebase error codes to user-friendly messages
        if (err.message.includes('invalid-credential')) {
          setError('Invalid email or password. Please try again.');
        } else if (err.message.includes('too-many-requests')) {
          setError('Too many failed attempts. Please try again later.');
        } else {
          setError('Failed to sign in. Please check your credentials.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await resetPassword(email);
      setResetEmailSent(true);
    } catch {
      setError('Failed to send reset email. Please check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setError('');
    setResetEmailSent(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-[#0A1F44] rounded-full flex items-center justify-center">
              <span className="text-2xl font-black text-white">3C</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0A1F44]">Employee Portal</h1>
            <p className="text-gray-500 mt-1">Sign in to access your dashboard</p>
          </div>

          {formMode === 'forgot' ? (
            // Forgot Password Form
            <form onSubmit={handleForgotPassword} className="space-y-6">
              {resetEmailSent ? (
                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
                  Password reset email sent! Check your inbox.
                </div>
              ) : (
                <>
                  {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="reset-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#8dc63f] text-white py-3 rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => { setFormMode('login'); resetForm(); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to Sign In
              </button>
            </form>
          ) : (
            // Login Form
            <form onSubmit={handleSubmit} className="space-y-6">
              {(error || authError) && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error || authError}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none transition-all"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => { setFormMode('forgot'); resetForm(); }}
                  className="text-sm text-[#8dc63f] hover:text-[#7ab82e] transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#8dc63f] text-white py-3 rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>

              <div className="text-center">
                <span className="text-gray-500 text-sm">Need an account? Contact your manager.</span>
              </div>
            </form>
          )}
        </div>

        {/* Back to main site */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            ← Back to main site
          </Link>
        </div>
      </div>
    </div>
  );
}
