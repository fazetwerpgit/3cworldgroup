'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserForm } from '@/components/admin/UserForm';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-leftovers.css';

export default function NewUserPage() {
  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="admin-line-main">
        <div className="admin-line">
          <PageTitle
            title="New user"
            meta="Pending"
            back={(
              <Link className="admin-line-clear-button" href="/portal/admin/users">
                ← Back to users
              </Link>
            )}
          />

          <div className="admin-line-person-layout">
            <main className="admin-line-panel">
              <UserForm />
            </main>
            <aside className="admin-line-panel">
              <h2 style={{ margin: '7px 0 0', fontSize: 20, fontWeight: 900 }}>
                Account details
              </h2>
              <p className="admin-line-sub">
                Set the role and manager while you create the account.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
