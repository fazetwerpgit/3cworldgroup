'use client';

import { RepShell } from '@/components/portal/rep/RepShell';
import { RepLogSale } from '@/components/portal/rep/RepLogSale';

export default function NewSalePage() {
  return (
    <RepShell permissions={['sales:write']} task="Log a sale">
      <RepLogSale />
    </RepShell>
  );
}
