'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
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
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Log New Sale
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  Enter customer, provider, and plan details. The submission goes into manager review.
                </p>
              </section>
              <SaleForm />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
