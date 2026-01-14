"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function PortalPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual authentication
    // For demo purposes, accept any login
    if (loginData.email && loginData.password) {
      setIsLoggedIn(true);
      setError("");
    } else {
      setError("Please enter your email and password");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginData({ email: "", password: "" });
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Logo */}
            <div className="text-center mb-8">
              <Image
                src="/logo.png"
                alt="3C World Group"
                width={80}
                height={80}
                className="mx-auto mb-4 rounded-full"
              />
              <div className="text-2xl font-bold text-gray-800 mb-1">World Group</div>
              <h1 className="text-lg text-gray-600">Employee Portal</h1>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--primary-green] focus:border-transparent outline-none"
                  placeholder="you@3cworldgroup.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--primary-green] focus:border-transparent outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-[--primary-green] focus:ring-[--primary-green]" />
                  <span className="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-sm text-[--primary-green] hover:text-[--primary-green-dark]">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                className="w-full bg-[--primary-green] text-white py-3 rounded-lg font-semibold hover:bg-[--primary-green-dark] transition-colors"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>Need help? Contact <a href="mailto:support@3cworldgroup.com" className="text-[--primary-blue]">support@3cworldgroup.com</a></p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              ← Back to main site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard (Logged In)
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Portal Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="3C World Group"
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="text-xl font-bold text-gray-800">Portal</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Welcome, {loginData.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-[--primary-green] to-[--primary-blue] rounded-2xl p-8 text-white mb-8">
          <h1 className="text-2xl font-bold mb-2">Welcome to Your Dashboard</h1>
          <p className="text-white/90">Track your performance, access resources, and manage your account.</p>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">This Week's Sales</div>
            <div className="text-3xl font-bold text-gray-900">$0</div>
            <div className="text-sm text-gray-400 mt-1">Coming soon</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Total Deals</div>
            <div className="text-3xl font-bold text-gray-900">0</div>
            <div className="text-sm text-gray-400 mt-1">Coming soon</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Pending</div>
            <div className="text-3xl font-bold text-gray-900">0</div>
            <div className="text-sm text-gray-400 mt-1">Coming soon</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Team Rank</div>
            <div className="text-3xl font-bold text-gray-900">-</div>
            <div className="text-sm text-gray-400 mt-1">Coming soon</div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-[--primary-green]">
                <div className="w-12 h-12 bg-[--primary-green]/10 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-[--primary-green]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Log a Sale</h3>
                <p className="text-sm text-gray-500">Record a new customer sale</p>
                <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Coming Soon</span>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-[--primary-blue]">
                <div className="w-12 h-12 bg-[--primary-blue]/10 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-[--primary-blue]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Training Materials</h3>
                <p className="text-sm text-gray-500">Access sales scripts & guides</p>
                <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Coming Soon</span>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-[--primary-green]">
                <div className="w-12 h-12 bg-[--primary-green]/10 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-[--primary-green]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Leaderboard</h3>
                <p className="text-sm text-gray-500">See top performers</p>
                <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Coming Soon</span>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-[--primary-blue]">
                <div className="w-12 h-12 bg-[--primary-blue]/10 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-[--primary-blue]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Account Settings</h3>
                <p className="text-sm text-gray-500">Update your profile</p>
                <span className="inline-block mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Coming Soon</span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Announcements */}
            <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Announcements</h2>
              <div className="space-y-4">
                <div className="border-l-4 border-[--primary-green] pl-4">
                  <h4 className="font-semibold text-gray-900">Portal Launch!</h4>
                  <p className="text-sm text-gray-500">Welcome to the new employee portal. More features coming soon.</p>
                  <span className="text-xs text-gray-400">Today</span>
                </div>
              </div>
            </div>

            {/* Help */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Need Help?</h2>
              <p className="text-sm text-gray-600 mb-4">
                Contact your manager or reach out to support for assistance.
              </p>
              <a
                href="mailto:support@3cworldgroup.com"
                className="inline-block bg-[--primary-blue] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[--primary-blue-dark] transition-colors"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
