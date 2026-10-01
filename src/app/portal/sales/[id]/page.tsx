'use client';

import { RepShell } from '@/components/portal/rep/RepShell';
import { RepSaleDetail } from '@/components/portal/rep/RepSaleDetail';

const BACK = { href: '/portal/sales', label: 'sales' };

export default function SaleDetailPage() {
  return (
    <RepShell permissions={['sales:read']} task="Sale" back={BACK}>
      <RepSaleDetail />
    </RepShell>
  );
}
