import { describe, expect, it } from 'vitest';
import { buildSaleDecisionPush } from './salePush';

describe('buildSaleDecisionPush', () => {
  it('names the customer on an approval and deep-links to the sales page', () => {
    const payload = buildSaleDecisionPush('approved', { customerName: 'Jane Doe' });
    expect(payload).toEqual({
      title: 'Sale approved',
      body: 'Jane Doe — approved',
      url: '/portal/sales',
    });
  });

  it('carries the rejection reason when one was given', () => {
    const payload = buildSaleDecisionPush('rejected', { customerName: 'Jane Doe' }, 'Missing proof');
    expect(payload.title).toBe('Sale rejected');
    expect(payload.body).toBe('Jane Doe — Missing proof');
  });

  it('still reads as a rejection when no reason was given', () => {
    expect(buildSaleDecisionPush('rejected', { customerName: 'Jane Doe' }).body).toBe(
      'Jane Doe — rejected'
    );
    expect(buildSaleDecisionPush('rejected', { customerName: 'Jane Doe' }, '   ').body).toBe(
      'Jane Doe — rejected'
    );
    expect(buildSaleDecisionPush('rejected', { customerName: 'Jane Doe' }, { evil: true }).body).toBe(
      'Jane Doe — rejected'
    );
  });

  it('falls back to the address when the sale has no customer name', () => {
    const payload = buildSaleDecisionPush('approved', { customerAddress: '12 Main St' });
    expect(payload.body).toBe('12 Main St — approved');
  });

  it('falls back to generic copy when the sale doc is missing or nameless', () => {
    expect(buildSaleDecisionPush('approved', undefined).body).toBe('Your sale — approved');
    expect(buildSaleDecisionPush('approved', { customerName: '  ' }).body).toBe(
      'Your sale — approved'
    );
  });
});
