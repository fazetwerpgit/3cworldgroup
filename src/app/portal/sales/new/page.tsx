'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { PageTitle } from '@/components/portal/PageTitle';
import { SaleForm } from '@/components/sales/SaleForm';
import '@/styles/sweep-leftovers.css';

export default function NewSalePage() {
  return (
    <ProtectedRoute permissions={['sales:write']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="sales-line-main flex-1 overflow-auto">
            <div className="sales-line">
              <PageTitle
                title="Log New Sale"
                subtitle="Enter customer, provider, and plan details. The submission goes into manager review."
                back={(
                  <Link className="sales-line-back" href="/portal/sales">
                    <ArrowLeft className="sales-line-icon" aria-hidden="true" />
                    Back to sales
                  </Link>
                )}
              />

              <SaleForm />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
