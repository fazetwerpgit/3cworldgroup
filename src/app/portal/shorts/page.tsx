'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';

export default function ShortsPage() {
  return (
    <ProtectedRoute permissions={['shorts:read']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold text-[#0A1F44]">Shorts</h1>
                <p className="text-gray-500 mt-1">
                  Quick training videos to help you succeed
                </p>
              </div>

              {/* Coming Soon */}
              <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-[#8dc63f] to-[#6ba32e] rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-[#0A1F44] mb-2">Shorts Coming Soon!</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Quick, bite-sized training videos will be available here soon.
                  Perfect for learning on the go!
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#8dc63f]">
                  <span className="w-2 h-2 bg-[#8dc63f] rounded-full animate-pulse"></span>
                  In Development
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
