import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import type { FiberOrder, FiberOrderStatus } from '@/types/fiberOrder';

type ParsedOrder = Omit<FiberOrder, 'matchedUserId' | 'updatedAt'>;
type Cell = ExcelJS.CellValue | undefined;

const ORDER_SHEETS = ['Orders To Date', 'Pre-Sale to Schedule', 'Unconfirmed to Cancelled Orders'] as const;

function text(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text.trim();
  return String(value).trim();
}

function dateFromCell(value: Cell): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    const serial = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(serial)) return null;
    date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  }
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function numberFromCell(value: Cell): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function headers(row: ExcelJS.Row): Map<string, number> {
  const result = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = text(cell.value);
    if (header) result.set(header, columnNumber);
  });
  return result;
}

function cell(row: ExcelJS.Row, map: Map<string, number>, name: string): Cell {
  const column = map.get(name);
  return column ? row.getCell(column).value : undefined;
}

function mappedStatus(rawStatus: string, activationDate: string | null, cancellationDate: string | null): FiberOrderStatus {
  switch (rawStatus) {
    case 'Pending Installation': return 'pending_install';
    case 'Active': return 'active';
    case 'No Installation Scheduled': return 'pre_sale';
    case 'Cancelled Order': return 'cancelled';
    case 'Churned': return 'churned';
    default:
      return activationDate ? 'active' : cancellationDate ? 'cancelled' : 'pending_install';
  }
}

function emptyOrder(id: string, sourceSheet: string, reportReceivedAt: string): ParsedOrder {
  return {
    id,
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '',
    repName: '',
    orderDate: null,
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: '',
    unit: null,
    city: null,
    state: null,
    zip: null,
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet,
    reportReceivedAt,
  };
}

function parseStandardRow(row: ExcelJS.Row, map: Map<string, number>, sourceSheet: string, reportReceivedAt: string, forcedStatus?: FiberOrderStatus): ParsedOrder | null {
  const id = text(cell(row, map, 'Alt Order ID'));
  if (!id) return null;
  const rawStatus = text(cell(row, map, 'Account Status'));
  const orderDate = dateFromCell(cell(row, map, 'Order Date'));
  const estInstallDate = dateFromCell(cell(row, map, 'Est. Installation Date'));
  const activationDate = dateFromCell(cell(row, map, 'Activation Date'));
  const cancellationDate = dateFromCell(cell(row, map, 'Order Cancellation Date'));
  const result = emptyOrder(id, sourceSheet, reportReceivedAt);
  result.rawStatus = rawStatus;
  result.status = forcedStatus ?? mappedStatus(rawStatus, activationDate, cancellationDate);
  result.repDealerId = text(cell(row, map, 'Rep ID'));
  result.repName = text(cell(row, map, 'dealername'));
  result.orderDate = orderDate;
  result.estInstallDate = estInstallDate;
  result.activationDate = activationDate;
  result.cancellationDate = cancellationDate;
  result.deactivationDate = dateFromCell(cell(row, map, 'Deactivation Date'));
  result.fiberPlan = text(cell(row, map, 'Fiber Plan')) || null;
  result.mrc = numberFromCell(cell(row, map, 'MRC'));
  result.address = text(cell(row, map, 'Street Address'));
  result.unit = text(cell(row, map, 'Unit')) || null;
  result.city = text(cell(row, map, 'City')) || null;
  result.state = text(cell(row, map, 'State')) || null;
  result.zip = text(cell(row, map, 'Zip Code')) || null;
  return result;
}

function parseCancelledRow(row: ExcelJS.Row, map: Map<string, number>, reportReceivedAt: string): ParsedOrder | null {
  const id = text(cell(row, map, 'Alt Order ID'));
  if (!id) return null;
  const result = emptyOrder(id, 'Unconfirmed to Cancelled Orders', reportReceivedAt);
  result.status = 'cancelled';
  result.rawStatus = text(cell(row, map, 'Account Status'));
  result.orderDate = dateFromCell(cell(row, map, 'Order Date'));
  result.cancellationDate = dateFromCell(cell(row, map, 'Cancelled Order'));
  result.address = text(cell(row, map, 'Street Address'));
  result.city = text(cell(row, map, 'City')) || null;
  result.state = text(cell(row, map, 'State')) || null;
  result.zip = text(cell(row, map, 'Zip Code')) || null;
  const dealer = text(cell(row, map, 'Dealer (Rep)'));
  const match = dealer.match(/^(.*)\s*\(([^()]*)\)\s*$/);
  result.repName = (match?.[1] ?? dealer).trim();
  result.repDealerId = (match?.[2] ?? '').trim();
  return result;
}

function parseBreakageRow(row: ExcelJS.Row, map: Map<string, number>, reportReceivedAt: string): ParsedOrder | null {
  const address = text(cell(row, map, 'ADDRESS'));
  if (!address) return null;
  const dateValue = cell(row, map, 'SCHEDULED_INSTALL_DATE');
  const serial = dateValue instanceof Date
    ? String((dateValue.getTime() - Date.UTC(1899, 11, 30)) / 86400000)
    : text(dateValue);
  const id = `brk_${createHash('sha1').update(`${address}|${serial}`).digest('hex')}`;
  const result = emptyOrder(id, 'Customer Driven Breakage', reportReceivedAt);
  result.status = 'breakage';
  result.rawStatus = text(cell(row, map, 'ACCOUNT_STATUS'));
  result.repDealerId = text(cell(row, map, 'DEALER_CODE'));
  result.repName = text(cell(row, map, 'DEALERNAME'));
  result.estInstallDate = dateFromCell(dateValue);
  result.fiberPlan = text(cell(row, map, 'OFFER')) || null;
  result.address = address;
  result.unit = text(cell(row, map, 'UNIT_NUMBER')) || null;
  result.city = text(cell(row, map, 'CITY')) || null;
  result.state = text(cell(row, map, 'STATE')) || null;
  result.zip = text(cell(row, map, 'ZIP_CODE')) || null;
  const reason = text(cell(row, map, 'TMO_REASON'));
  const code = text(cell(row, map, 'REASON_CODE'));
  result.breakageReason = reason || code ? `${reason} — ${code}` : null;
  result.breakageNotes = text(cell(row, map, 'NOTES')) || null;
  result.customerName = `${text(cell(row, map, 'CSTMR_FIRST_NAME'))} ${text(cell(row, map, 'CSTMR_LAST_NAME'))}`.trim() || null;
  return result;
}

function readSheetRows(sheet: ExcelJS.Worksheet): { map: Map<string, number>; rows: ExcelJS.Row[] } {
  const header = sheet.getRow(1);
  const map = headers(header);
  const rows: ExcelJS.Row[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) rows.push(sheet.getRow(rowNumber));
  return { map, rows };
}

export async function parseFiberReport(buffer: Buffer, reportReceivedAt: string): Promise<{
  orders: ParsedOrder[];
  rowCounts: Record<string, number>;
}> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS currently resolves its Buffer type against a different Node
  // lib version than this app's @types/node package.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const byId = new Map<string, ParsedOrder>();
  const rowCounts: Record<string, number> = {};

  for (const sheetName of ORDER_SHEETS) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const { map, rows } = readSheetRows(sheet);
    let count = 0;
    for (const row of rows) {
      const parsed = sheetName === 'Unconfirmed to Cancelled Orders'
        ? parseCancelledRow(row, map, reportReceivedAt)
        : parseStandardRow(row, map, sheetName, reportReceivedAt, sheetName === 'Pre-Sale to Schedule' ? 'pre_sale' : undefined);
      if (parsed) { count += 1; byId.set(parsed.id, parsed); }
    }
    rowCounts[sheetName] = count;
  }

  const breakageSheet = workbook.getWorksheet('Customer Driven Breakage');
  if (breakageSheet) {
    const { map, rows } = readSheetRows(breakageSheet);
    let count = 0;
    for (const row of rows) {
      const parsed = parseBreakageRow(row, map, reportReceivedAt);
      if (parsed) { count += 1; byId.set(parsed.id, parsed); }
    }
    rowCounts['Customer Driven Breakage'] = count;
  }
  return { orders: [...byId.values()], rowCounts };
}
