import { describe, expect, it } from 'vitest';
import { escalinkTicketText } from './escalink';

describe('escalinkTicketText', () => {
  it('fills in what the EscaLink intake asks for, in its order, leaving the issue for the rep', () => {
    const text = escalinkTicketText({
      dealerCode: '4721016',
      customerName: 'Dana Reyes',
      customerPhone: '(515) 555-0134',
      address: '4120 Wentworth Ave, Des Moines, IA 50315',
      carrierOrderId: 'TMO20260824UZMTV',
      orderNumberOrBtn: '5155550134',
      plan: 'TFiber 1 Gig',
      soldOn: 'Aug 22',
      install: 'Install Thu, Aug 28',
    });

    expect(text.split('\n')).toEqual([
      'Submitter: D2D Agent · Dealer code 4721016',
      'Customer: Dana Reyes · (515) 555-0134',
      'Service address: 4120 Wentworth Ave, Des Moines, IA 50315',
      'Order: TMO20260824UZMTV / 5155550134 · TFiber 1 Gig · Sold Aug 22 · Install Thu, Aug 28',
      'What happened: ',
      'Need from Fiber Support: ',
    ]);
  });

  it('never guesses a missing detail, and lists an order number once when both sources agree', () => {
    const text = escalinkTicketText({
      dealerCode: null,
      customerName: '  ',
      address: null,
      carrierOrderId: 'TMO1',
      orderNumberOrBtn: 'TMO1',
    });

    expect(text).toContain('Dealer code (add dealer code)');
    expect(text).toContain('Customer: (name and phone)');
    expect(text).toContain('Service address: (full service address)');
    expect(text).toContain('Order: TMO1\n');
    expect(text).not.toContain('TMO1 / TMO1');
  });
});
