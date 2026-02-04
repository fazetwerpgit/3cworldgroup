'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SaleForm } from '@/components/sales/SaleForm';

export default function NewSalePage() {
  return (
    <ProtectedRoute permissions={['sales:write']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#0A1F44]">Log New Sale</h1>
                <p className="text-gray-500 mt-1">
                  Enter the details of your sale. It will be submitted for approval.
                </p>
              </div>

              {/* Form */}
              <SaleForm />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
