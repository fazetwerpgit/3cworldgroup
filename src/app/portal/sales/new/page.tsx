'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SaleForm } from '@/components/sales/SaleForm';

function dateLabel() {
  const now = new Date();
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now).toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase(),
  };
}

export default function NewSalePage() {
  const { month, weekday } = dateLabel();

  return (
    <ProtectedRoute permissions={['sales:write']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="sales-line-main flex-1 overflow-auto">
            <div className="sales-line">
              <div className="sales-line-mast">
                <span className="sales-line-mark">3C WORLD GROUP / THE LINE / SALES</span>
                <span className="sales-line-mast-meta">{month} · {weekday}</span>
              </div>

              <Link className="sales-line-back" href="/portal/sales">
                <ArrowLeft className="sales-line-icon" aria-hidden="true" />
                Back to sales
              </Link>

              <header className="sales-line-subhead">
                <div>
                  <p className="sales-line-eyebrow">Sales workspace / new</p>
                  <h1>Log New Sale</h1>
                  <p className="sales-line-subhead-id">Enter customer, provider, and plan details. The submission goes into manager review.</p>
                </div>
              </header>

              <SaleForm />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
