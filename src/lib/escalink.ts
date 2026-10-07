// EscaLink: T-Mobile's ticket app (a Microsoft Power App) where D2D agents
// submit Install / Order Support requests to T-Mobile Fiber Support, launched
// 2026-10-01. It lives in T-Mobile's Microsoft tenant: reps sign in with the
// account T-Mobile gives them, and tickets never touch the portal. The portal
// can only send reps there with the details already gathered.

import type { Sale } from '@/types';

/** The link from T-Mobile's launch email (Charity Davis, 2026-10-01), minus tracking params. */
export const ESCALINK_URL =
  'https://apps.powerapps.com/play/e/05cf453d-97cc-e9c9-8f96-9edf3fcbd000/app/a1b533cd-1f30-4276-ae81-acf33e2adefc?tenantId=be0f980b-dd99-4b19-bd7b-bc71a09b026c';

/** "For immediate assistance" in the training guide. */
export const FIBER_SUPPORT_PHONE = '888-310-8369';

/** The issue types an agent picks on the intake, as the training guide defines them. */
export const ESCALINK_ISSUE_TYPES: Array<{ name: string; use: string }> = [
  {
    name: 'Address Investigation',
    use: "The service address needs review before the order can move: not found, wrong serviceability, unit mismatch, or shows available but won't work in the order flow.",
  },
  {
    name: 'Buyflow Errors',
    use: 'You get an error while placing or finishing an order. Include the error message, screenshots, payment attempt details if any, and where it happened.',
  },
  {
    name: 'Install Investigation',
    use: 'An install is delayed, its status is unclear, field partner updates or install info are missing, or it is not moving.',
  },
  {
    name: 'Missed Promo',
    use: 'A promotion should be on the order but is missing or wrong. Include the promo name and order date.',
  },
  {
    name: 'Reschedule',
    use: 'The appointment needs moving and the customer refuses the T-Life app or the email reschedule link, so Fiber Support has to call them.',
  },
  {
    name: 'Other',
    use: 'Only when nothing above fits. Say why, and include every customer and order detail.',
  },
];

/** True when any product on the sale is T-Mobile Fiber: the only sales EscaLink handles. */
export function isTMobileSale(sale: Pick<Sale, 'products'>): boolean {
  return (sale.products ?? []).some((product) => product.company === 'tfiber');
}

export interface EscalinkTicketInput {
  dealerCode: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  /** T-Mobile's order id from the carrier report (e.g. TMO20260824UZMTV). */
  carrierOrderId?: string | null;
  /** What the rep logged as "Order / BTN". */
  orderNumberOrBtn?: string | null;
  plan?: string | null;
  soldOn?: string | null;
  /** "Installs Thu, Oct 9 (scheduled)", "Missed install", ... */
  install?: string | null;
}

/**
 * Everything the intake asks for, in its order, ready to paste. Missing
 * details are left out rather than guessed; the issue and the ask stay blank
 * for the rep to write, because only they know what went wrong.
 */
export function escalinkTicketText(input: EscalinkTicketInput): string {
  const clean = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const orderIds = [clean(input.carrierOrderId), clean(input.orderNumberOrBtn)]
    .filter((value, index, all): value is string => !!value && all.indexOf(value) === index);
  const customer = [clean(input.customerName), clean(input.customerPhone)].filter(Boolean).join(' · ');
  const order = [
    orderIds.length ? `Order: ${orderIds.join(' / ')}` : null,
    clean(input.plan),
    clean(input.soldOn) ? `Sold ${clean(input.soldOn)}` : null,
    clean(input.install),
  ].filter(Boolean).join(' · ');
  return [
    `Submitter: D2D Agent · Dealer code ${clean(input.dealerCode) ?? '(add dealer code)'}`,
    `Customer: ${customer || '(name and phone)'}`,
    `Service address: ${clean(input.address) ?? '(full service address)'}`,
    ...(order ? [order] : []),
    'What happened: ',
    'Need from Fiber Support: ',
  ].join('\n');
}
