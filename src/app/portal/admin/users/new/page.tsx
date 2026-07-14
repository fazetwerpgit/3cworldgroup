'use client';

import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserForm } from '@/components/admin/UserForm';

export default function NewUserPage() {
  const router = useRouter();

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="admin-line-main">
        <div className="admin-line">
          <header className="admin-line-hero">
            <div>
              <div className="admin-line-kicker">person record / new record</div>
              <h1>
                <span className="accent">Add a person.</span>
                <span className="plain">Make the record useful.</span>
              </h1>
              <p className="admin-line-intro">
                The same record surface serves editing and creating. Keep identity clear, role
                decisions explicit, and sensitive records behind a visible boundary.
              </p>
              <div className="admin-line-quick-rail">
                <span className="admin-line-chip">new record</span>
              </div>
            </div>
          </header>

          <button
            type="button"
            className="admin-line-clear-button"
            style={{ marginTop: 14 }}
            onClick={() => router.push('/portal/admin/users')}
          >
            ← Back to roster
          </button>

          <div className="admin-line-person-layout">
            <main className="admin-line-panel">
              <UserForm />
            </main>
            <aside className="admin-line-panel">
              <div className="admin-line-eyebrow">record posture</div>
              <h2 style={{ margin: '7px 0 0', fontSize: 20, fontWeight: 900, letterSpacing: '-.06em', textTransform: 'uppercase' }}>
                One person, one decision.
              </h2>
              <p className="admin-line-sub">
                Set the role and reporting line now — sensitive records unlock once the account
                exists.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
