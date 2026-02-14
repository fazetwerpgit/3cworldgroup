'use client';

import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { QuickActions } from '@/components/portal/QuickActions';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getTimeEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '🌙';
    if (hour < 12) return '☀️';
    if (hour < 18) return '🔥';
    return '🌙';
  };

  const getMotivationalQuote = () => {
    const quotes = [
      "Let's get this bread! 🍞",
      "Time to stack those points! 📈",
      "Grind mode activated 💪",
      "Another day, another W 🏆",
      "Main character energy today ✨",
      "Built different, selling different 😤",
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Section - Dark Gradient with Animated Elements */}
      <div className={`relative rounded-2xl overflow-hidden transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#0f2744] animate-gradient" style={{ backgroundSize: '200% 200%' }}></div>

        {/* Floating particles effect */}
        <div className="absolute inset-0 particles-bg"></div>

        {/* Decorative glowing orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#8dc63f]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#6A8FE3]/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-[#8dc63f]/10 rounded-full blur-2xl animate-float"></div>

        <div className="relative p-4 sm:p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-3 sm:space-y-4">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 sm:px-4 py-1.5 border border-white/20">
                <span className="w-2 h-2 bg-[#8dc63f] rounded-full animate-pulse"></span>
                <span className="text-white/70 text-xs sm:text-sm">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white flex flex-wrap items-center gap-2 sm:gap-3">
                {getGreeting()}, {user?.displayName || user?.email?.split('@')[0] || 'Legend'}!
                <span className="text-2xl sm:text-3xl">{getTimeEmoji()}</span>
              </h1>

              <p className="text-white/80 text-base sm:text-lg max-w-lg animate-fade-in">
                {getMotivationalQuote()}
              </p>

              {/* Quick stats chips */}
              <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
                <div className="glass-card rounded-xl px-3 sm:px-4 py-2 flex items-center gap-2 icon-hover-pop">
                  <span className="text-lg sm:text-xl">👤</span>
                  <div>
                    <span className="text-white/60 text-xs block">Role</span>
                    <span className="font-semibold text-white capitalize text-sm sm:text-base">{user?.role?.replace('_', ' ') || 'Sales Rep'}</span>
                  </div>
                </div>
                {user?.territoryId && (
                  <div className="glass-card rounded-xl px-3 sm:px-4 py-2 flex items-center gap-2 icon-hover-pop">
                    <span className="text-lg sm:text-xl">📍</span>
                    <div>
                      <span className="text-white/60 text-xs block">Territory</span>
                      <span className="font-semibold text-white text-sm sm:text-base">{user.territoryId}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CTA Button with glow - visible on mobile too */}
            <Link
              href="/portal/sales/new"
              className="flex items-center justify-center md:justify-start gap-3 bg-[#8dc63f] text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold hover:bg-[#7ab82e] transition-all shadow-lg hover:shadow-[0_0_30px_rgba(141,198,63,0.5)] hover:-translate-y-1 shine-effect w-full md:w-auto"
            >
              <div className="p-2 bg-white/20 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="text-left">
                <span className="block text-sm text-white/80">Start Earning</span>
                <span className="block">Log New Sale</span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid with staggered animation */}
      <div className={`transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <DashboardStats />
      </div>

      {/* Quick Actions */}
      <div className={`transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <QuickActions />
      </div>

      {/* Two Column Layout */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Pro Tips - Dark glassmorphism card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] p-6 border border-white/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#8dc63f]/10 rounded-full blur-2xl"></div>

          <div className="relative flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-[#8dc63f] to-[#6ba32e] rounded-xl text-white shadow-lg">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-xl flex items-center gap-2">
                Pro Tip
                <span className="text-sm bg-[#8dc63f]/20 text-[#8dc63f] px-2 py-0.5 rounded-full">Daily</span>
              </h3>
              <p className="text-white/70 mt-3 leading-relaxed">
                Focus on building relationships first. When customers trust you, they&apos;re more likely
                to choose the plan that best fits their needs - and refer their friends! 🤝
              </p>
              <div className="mt-4 flex items-center gap-2 text-[#8dc63f]">
                <svg className="w-5 h-5 animate-twinkle" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-semibold">Premium plans = More points!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity - Modern dark card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 border border-white/10">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>

          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">⚡</span> Recent Activity
              </h2>
              <Link href="/portal/sales" className="text-sm text-[#8dc63f] hover:text-[#a8d668] font-medium flex items-center gap-1 transition-colors">
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="text-center py-8">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-semibold text-white">No recent activity</p>
              <p className="text-sm text-white/50 mt-1">Your sales will appear here</p>
              <Link
                href="/portal/sales/new"
                className="inline-flex items-center gap-2 mt-5 bg-[#8dc63f] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#7ab82e] transition-all hover:shadow-[0_0_20px_rgba(141,198,63,0.4)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Log your first sale
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Queue Alert (for operations/managers) */}
      {hasPermission('sales:approve') && (
        <div className={`relative overflow-hidden bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-5 flex items-center justify-between transition-all duration-700 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 animate-pulse"></div>
          <div className="relative flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-amber-200 text-lg">Sales Need Your Review</p>
              <p className="text-amber-200/70 text-sm">Team members are waiting for approval</p>
            </div>
          </div>
          <Link
            href="/portal/approvals"
            className="relative px-5 py-3 bg-amber-500 text-gray-900 rounded-xl font-bold hover:bg-amber-400 transition-all hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] shadow-lg"
          >
            Review Now →
          </Link>
        </div>
      )}
    </div>
  );
}
