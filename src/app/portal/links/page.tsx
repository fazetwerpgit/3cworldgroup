'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';

// Sample links - these would come from Firestore in production
const quickLinks = [
  {
    title: 'TFiber Service Check',
    description: 'Check if TFiber service is available at an address',
    url: 'https://www.t-mobile.com/isp',
    icon: '🏠',
    category: 'Service Tools',
  },
  {
    title: 'AT&T Fiber Availability',
    description: 'Check AT&T Fiber availability by address',
    url: 'https://www.att.com/internet/fiber/',
    icon: '📡',
    category: 'Service Tools',
  },
  {
    title: 'Frontier Availability',
    description: 'Check Frontier Fiber service availability',
    url: 'https://frontier.com/',
    icon: '🌐',
    category: 'Service Tools',
  },
  {
    title: 'Company Handbook',
    description: 'Employee policies and procedures',
    url: '#',
    icon: '📚',
    category: 'Resources',
  },
  {
    title: 'Benefits Portal',
    description: 'Access your employee benefits',
    url: '#',
    icon: '💼',
    category: 'Resources',
  },
];

export default function LinksPage() {
  const categories = [...new Set(quickLinks.map(link => link.category))];

  return (
    <ProtectedRoute permissions={['links:read']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold text-[#0A1F44]">Quick Links</h1>
                <p className="text-gray-500 mt-1">
                  Useful tools and resources at your fingertips
                </p>
              </div>

              {/* Links by Category */}
              {categories.map(category => (
                <div key={category}>
                  <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">{category}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quickLinks
                      .filter(link => link.category === category)
                      .map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-[#8dc63f] transition-all group"
                        >
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">{link.icon}</span>
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 group-hover:text-[#8dc63f] transition-colors flex items-center gap-2">
                                {link.title}
                                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </h3>
                              <p className="text-sm text-gray-500 mt-1">{link.description}</p>
                            </div>
                          </div>
                        </a>
                      ))}
                  </div>
                </div>
              ))}

              {/* Info */}
              <div className="bg-[#0A1F44]/5 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-sm text-gray-600">
                  Need a link added? Contact your operations team to request new resources.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
