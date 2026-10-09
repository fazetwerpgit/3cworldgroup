'use client';

import { RepShell } from '@/components/portal/rep/RepShell';
import { RepBulkLog } from '@/components/portal/rep/RepBulkLog';

export default function BulkLogSalesPage() {
  return (
    <RepShell permissions={['sales:write']} task="Log several sales" back={{ href: '/portal/sales/new', label: 'Log Sale' }}>
      <RepBulkLog />
    </RepShell>
  );
}
