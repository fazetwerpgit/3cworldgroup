'use client';

import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';

export function PendingApproval() {
  const { clearPendingApproval } = useAuth();
  return (
    <AuthShell>
      <div className="w-full max-w-sm animate-fade-in-up">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#8dc63f]/15 text-[#5a8f1f] dark:text-[#9fd44f]">
          <Clock className="h-5 w-5" />
        </span>
        <p className="portal-label mt-5">Employee portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Account pending approval
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Your account is awaiting admin approval. If you signed up with email and password, check your inbox and spam
          folder for a verification email. You’ll be able to sign in once it’s approved — no need to sign up again.
        </p>

        <div className="mt-8">
          <button
            type="button"
            onClick={clearPendingApproval}
            className="portal-motion inline-flex h-11 w-full items-center justify-center rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e]"
          >
            Back to sign in
          </button>
        </div>

        <div className="mt-10 text-center lg:text-left">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to main site
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
