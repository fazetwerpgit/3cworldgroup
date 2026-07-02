'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SaleForm } from '@/components/sales/SaleForm';

export default function NewSalePage() {
  return (
    <ProtectedRoute permissions={['sales:write']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1100px] space-y-5">
              <PortalPageHeader
                compact
                eyebrow="Sales workspace"
                title="Log New Sale"
                description="Enter customer, provider, and plan details. The submission goes into manager review."
              />
              <div className="portal-enter portal-enter-2">
                <SaleForm />
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
