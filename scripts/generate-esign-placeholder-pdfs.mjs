import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = {
  width: 612,
  height: 792,
};

const SIGNATURE_AREA = {
  labelX: 72,
  lineX: 140,
  lineY: 140,
  lineWidth: 190,
};

const DATE_AREA = {
  labelX: 390,
  lineX: 430,
  lineY: 140,
  lineWidth: 110,
};

const DOCS = [
  { file: 'contract.pdf', title: 'Employment Agreement' },
  { file: 'direct_deposit.pdf', title: 'Direct Deposit Authorization' },
  { file: 'pay_structure.pdf', title: 'Pay Structure Acknowledgment' },
  { file: 'fcra_auth.pdf', title: 'FCRA Background Check Authorization' },
];

const placeholder =
  'Placeholder document for e-sign flow testing. Final copy to be provided by 3C World Group.';

async function createPdf({ file, title }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText(title, {
    x: 72,
    y: 700,
    size: 22,
    font: bold,
    color: rgb(0.04, 0.12, 0.27),
  });

  page.drawText(placeholder, {
    x: 72,
    y: 650,
    size: 11,
    font,
    color: rgb(0.2, 0.25, 0.32),
    maxWidth: 460,
    lineHeight: 16,
  });

  page.drawText('Signature:', {
    x: SIGNATURE_AREA.labelX,
    y: SIGNATURE_AREA.lineY + 4,
    size: 12,
    font: bold,
    color: rgb(0.06, 0.09, 0.16),
  });
  page.drawLine({
    start: { x: SIGNATURE_AREA.lineX, y: SIGNATURE_AREA.lineY },
    end: { x: SIGNATURE_AREA.lineX + SIGNATURE_AREA.lineWidth, y: SIGNATURE_AREA.lineY },
    thickness: 1,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText('Date:', {
    x: DATE_AREA.labelX,
    y: DATE_AREA.lineY + 4,
    size: 12,
    font: bold,
    color: rgb(0.06, 0.09, 0.16),
  });
  page.drawLine({
    start: { x: DATE_AREA.lineX, y: DATE_AREA.lineY },
    end: { x: DATE_AREA.lineX + DATE_AREA.lineWidth, y: DATE_AREA.lineY },
    thickness: 1,
    color: rgb(0.06, 0.09, 0.16),
  });

  const bytes = await pdf.save();
  await writeFile(path.join('assets', 'esign', file), bytes);
}

await mkdir(path.join('assets', 'esign'), { recursive: true });
for (const doc of DOCS) {
  await createPdf(doc);
}

console.log(`Generated ${DOCS.length} e-sign placeholder PDFs in assets/esign`);
