import ExcelJS from 'exceljs';

// Reads the owner's employee spreadsheet: first worksheet, NO header row, one
// person per row. Columns are fixed by position:
//   1 full name   2 phone   3 email   4 address (multi-line)   5 state name
//   6 shirt size  7 manager 8 "Yes" = over 18   9 SSN   10 driver's license #
// Columns 5, 7 and 8 are deliberately never read: the portal does not take a
// manager, an age flag or a spelled-out state from this sheet.
//
// Values stay in memory only. Nothing here logs or persists a cell.

export interface SheetRow {
  name: string;
  phone: string;
  email: string;
  address: string;
  shirtSize: string;
  ssn: string;
  dlNumber: string;
}

const COL = { name: 1, phone: 2, email: 3, address: 4, shirt: 6, ssn: 9, dl: 10 } as const;

function cellText(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return '';
  // cell.text renders rich text, hyperlinks (email cells) and formula results.
  return (typeof value === 'number' ? String(value) : cell.text ?? '').trim();
}

// An SSN typed into a number-formatted cell loses its leading zeros; the stored
// number is still the SSN, so restore the width.
function ssnText(row: ExcelJS.Row): string {
  const value = row.getCell(COL.ssn).value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1e9) {
    return String(value).padStart(9, '0');
  }
  return cellText(row, COL.ssn);
}

export class SheetReadError extends Error {}

export async function parseEmployeeSheet(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SheetReadError('Not a readable .xlsx file');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SheetReadError('The file has no worksheet');

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const parsed: SheetRow = {
      name: cellText(row, COL.name).replace(/\s+/g, ' '),
      phone: cellText(row, COL.phone),
      email: cellText(row, COL.email).toLowerCase(),
      address: cellText(row, COL.address),
      shirtSize: cellText(row, COL.shirt),
      ssn: ssnText(row),
      dlNumber: cellText(row, COL.dl),
    };
    if (parsed.name || parsed.email) rows.push(parsed);
  });
  return rows;
}
