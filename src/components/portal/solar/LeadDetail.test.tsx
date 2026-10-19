// @vitest-environment jsdom
//
// A lead's bill or panel can be a PDF: the detail shows it as a link that
// opens the file, and photos stay tap-to-view thumbnails.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolarLeadView } from '@/lib/solar/leadView';

const urls = vi.hoisted(() => ({ byPath: {} as Record<string, string> }));
vi.mock('./solarClient', () => ({
  photoUrl: (path: string) => Promise.resolve(urls.byPath[path] ?? null),
}));
vi.mock('@/components/portal/rep/ImageViewer', () => ({
  useAttachmentViewer: () => ({ show: vi.fn(), viewer: null }),
}));

import { LeadDetail } from './LeadDetail';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BILL = 'form-attachments/rep1/solar-lead/up1/billPage1/';
const PANEL = 'form-attachments/rep1/solar-lead/up1/panel/';

const lead: SolarLeadView = {
  id: 'lead1',
  status: 'new',
  first: 'Maria',
  last: 'Lopez',
  address: '12 Elm St',
  city: 'Fresno',
  state: 'CA',
  zip: '93701',
  phone: '5555551234',
  email: 'maria@example.com',
  monthlyBill: 150,
  creditTier: null,
  photos: { billPage1: BILL, panel: PANEL },
  source: 'portal',
  repUid: 'rep1',
  repName: 'Rep One',
  createdAt: null,
  updatedAt: null,
  booking: null,
};

describe('LeadDetail attachments', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    urls.byPath = {
      [BILL]: `https://signed.example/${BILL}bill.pdf?sig=1`,
      [PANEL]: `https://signed.example/${PANEL}panel.jpg?sig=1`,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('links a PDF and keeps a photo as a thumbnail', async () => {
    await act(async () => {
      root.render(<LeadDetail lead={lead} />);
    });
    const pdf = container.querySelector<HTMLAnchorElement>('a[aria-label$="(PDF)"]');
    expect(pdf).not.toBeNull();
    expect(pdf!.href).toBe(urls.byPath[BILL]);
    expect(pdf!.target).toBe('_blank');
    expect(pdf!.rel).toContain('noopener');

    const img = container.querySelector<HTMLImageElement>('img');
    expect(img?.src).toBe(urls.byPath[PANEL]);
    expect(container.querySelectorAll('a[aria-label$="(PDF)"]')).toHaveLength(1);
  });
});
