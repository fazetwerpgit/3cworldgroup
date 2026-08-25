import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseFiberReport } from './parseReport';

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const orders = workbook.addWorksheet('Orders To Date');
  orders.addRow(['Alt Order ID', 'Account Status', 'Rep ID', 'dealername', 'Order Date', 'Est. Installation Date', 'Activation Date', 'Street Address', 'MRC', 'Fiber Plan']);
  orders.addRow(['A-1', 'Active', '42', 'Ada Rep', 46262, 46270, 46280, '1 Main St', 59.99, '1 Gig']);
  orders.addRow(['A-2', 'Pending Installation', '43', 'Bee Rep', '', '', '', '2 Main St', '', '']);

  const presale = workbook.addWorksheet('Pre-Sale to Schedule');
  presale.addRow(['Alt Order ID', 'Account Status', 'Rep ID', 'dealername', 'Order Date', 'Street Address']);
  presale.addRow(['P-1', 'No Installation Scheduled', '44', 'Cece Rep', 46262, '3 Main St']);

  const cancelled = workbook.addWorksheet('Unconfirmed to Cancelled Orders');
  cancelled.addRow(['Order Date', 'Account Status', 'Cancelled Order', 'Alt Order ID', 'Dealer (Rep)', 'Street Address', 'City', 'State', 'Zip Code']);
  cancelled.addRow([46262, 'Cancelled Order', 46290, 'A-2', 'Cancel Rep (99)', '2 Main St', 'Austin', 'TX', '78701']);

  const breakage = workbook.addWorksheet('Customer Driven Breakage');
  breakage.addRow(['SCHEDULED_INSTALL_DATE', 'ADDRESS', 'DEALER_CODE', 'DEALERNAME', 'TMO_REASON', 'REASON_CODE', 'NOTES', 'ACCOUNT_STATUS', 'OFFER', 'UNIT_NUMBER', 'CITY', 'STATE', 'ZIP_CODE', 'CSTMR_FIRST_NAME', 'CSTMR_LAST_NAME']);
  breakage.addRow([46300, '4 Main St', '55', 'Delta Rep', 'CX Missed', 'Customer Not Home', 'Call back', 'Open', '500 Mbps', '', 'Austin', 'TX', '78701', 'Test', 'Customer']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseFiberReport', () => {
  it('maps dates/statuses, deduplicates order IDs, and creates breakage IDs', async () => {
    const result = await parseFiberReport(await workbookBuffer(), '2026-08-25T12:00:00.000Z');
    expect(result.rowCounts).toEqual({
      'Orders To Date': 2,
      'Pre-Sale to Schedule': 1,
      'Unconfirmed to Cancelled Orders': 1,
      'Customer Driven Breakage': 1,
    });
    expect(result.orders).toHaveLength(4);
    const active = result.orders.find((order) => order.id === 'A-1');
    expect(active).toMatchObject({
      status: 'active',
      rawStatus: 'Active',
      orderDate: '2026-08-28',
      estInstallDate: '2026-09-05',
      activationDate: '2026-09-15',
    });
    expect(result.orders.find((order) => order.id === 'A-2')).toMatchObject({
      status: 'cancelled',
      rawStatus: 'Cancelled Order',
      cancellationDate: '2026-09-25',
      repName: 'Cancel Rep',
      repDealerId: '99',
    });
    expect(result.orders.find((order) => order.id === 'P-1')?.status).toBe('pre_sale');
    expect(result.orders.find((order) => order.status === 'breakage')?.id).toMatch(/^brk_[a-f0-9]{40}$/);
  });
});
