'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { UserForm } from '@/components/admin/UserForm';

export default function NewUserPage() {
  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#0A1F44]">Add New User</h1>
                <p className="text-gray-500 mt-1">
                  Create a new employee account with the appropriate role and permissions.
                </p>
              </div>

              {/* Form */}
              <UserForm />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
