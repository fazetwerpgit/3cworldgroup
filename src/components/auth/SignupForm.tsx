'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { validateSignup } from '@/lib/auth/signupValidation';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';

const inputClasses =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#8dc63f] focus:ring-2 focus:ring-[#8dc63f]/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400';

export function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateSignup(email, password);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      // AuthContext set pendingApproval; go to /portal, which renders the
      // pending-approval screen (this page only knows how to show the form).
      router.push('/portal');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm animate-fade-in-up">
        <p className="portal-label">Employee portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A manager approves new accounts before access.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="signup-email" className="portal-label mb-2 block">Email address</label>
            <input
              type="email"
              id="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
              placeholder="you@3cworldgroup.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="portal-label mb-2 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClasses} pr-11`}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="portal-motion h-11 w-full rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link href="/portal" className="font-medium text-[#5a8f1f] hover:underline dark:text-[#9fd44f]">
            Sign in
          </Link>
        </p>

        <div className="mt-10 text-center lg:text-left">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to main site
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
