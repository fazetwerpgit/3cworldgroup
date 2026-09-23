'use client';

import { UserForm } from '@/components/admin/UserForm';
import { AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import d from '../user-detail.module.css';

export default function NewUserPage() {
  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          back={{ href: '/portal/admin/users', label: 'Users' }}
          title="New user"
          sub="Set the role and manager while you create the account."
        />
        <div className={d.single}>
          <UserForm />
        </div>
      </div>
    </AdminGate>
  );
}
