'use client';

import { useParams } from 'next/navigation';
import { RepShell } from '@/components/portal/rep/RepShell';
import { RepSaleEdit } from '@/components/portal/rep/RepSaleEdit';

export default function EditSalePage() {
  const params = useParams();
  const saleId = params.id as string;

  return (
    <RepShell
      permissions={['sales:read']}
      task="Edit sale"
      back={{ href: `/portal/sales/${saleId}`, label: 'sale' }}
    >
      <RepSaleEdit />
    </RepShell>
  );
}
