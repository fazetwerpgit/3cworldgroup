// @vitest-environment jsdom
//
// Slide 5's upload tiles take a photo or a PDF of the bill or panel. A PDF
// tile shows the file's name instead of an image preview.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deck = vi.hoisted(() => ({
  state: {
    clientId: 'c1',
    uploadId: 'up1',
    monthlyBill: 150,
    lead: { first: '', last: '', address: '', city: '', state: '', zip: '', phone: '', email: '' },
    photos: {} as Record<string, string>,
    leadId: null as string | null,
    roofType: null as string | null,
    savedContact: null as string | null,
  },
}));
vi.mock('./deckState', () => ({
  useDeck: () => ({
    state: deck.state,
    update: (patch: object | ((prev: typeof deck.state) => object)) =>
      Object.assign(deck.state, typeof patch === 'function' ? patch(deck.state) : patch),
  }),
}));
const upload = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/lib/forms/uploadFormAttachment', () => ({
  uploadFormAttachment: upload.fn,
  isUploadCancelled: () => false,
  FormUploadError: class extends Error {},
}));

const api = vi.hoisted(() => ({ createLead: vi.fn(), updateLeadContact: vi.fn() }));
vi.mock('./solarClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./solarClient')>()),
  createLead: api.createLead,
  updateLeadContact: api.updateLeadContact,
}));

import { LeadFormSlide } from './LeadFormSlide';
import { contactKey } from './solarClient';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LeadFormSlide uploads', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    deck.state.photos = {};
    upload.fn.mockReset();
    upload.fn.mockImplementation(({ slot }: { slot: string }) =>
      Promise.resolve(`form-attachments/rep1/solar-lead/up1/${slot}/`)
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<LeadFormSlide onSaved={() => {}} />));
    const photosStep = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('3Photos'));
    act(() => photosStep!.click());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('lets each tile pick a photo or a PDF', () => {
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(3);
    inputs.forEach((input) => expect(input.accept).toBe('image/*,application/pdf'));
  });

  it('uploads a PDF and shows its name on the tile', async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['%PDF-1.4'], 'edison-bill.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(upload.fn).toHaveBeenCalledTimes(1);
    const args = upload.fn.mock.calls[0][0] as { file: File; slot: string; allowedTypes: string[] };
    expect(args.file).toBe(file);
    expect(args.slot).toBe('billPage1');
    expect(args.allowedTypes).toContain('application/pdf');
    expect(deck.state.photos.billPage1).toBe('form-attachments/rep1/solar-lead/up1/billPage1/');
    expect(container.textContent).toContain('edison-bill.pdf');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('LeadFormSlide roof type', () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))!;

  beforeEach(() => {
    deck.state.photos = {};
    deck.state.leadId = null;
    deck.state.roofType = null;
    deck.state.lead = {
      first: 'Ana', last: 'Ruiz', address: '1 Main St', city: 'Fresno', state: 'CA', zip: '93701',
      phone: '5595551234', email: 'ana@example.com',
    };
    api.createLead.mockReset().mockResolvedValue({ ok: true, data: { success: true, id: 'lead1' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<LeadFormSlide onSaved={() => {}} />));
    act(() => button('2Home').click());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('stops the lead on a blocked roof', async () => {
    act(() => button('Metal').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Metal roofs don't qualify/);
    act(() => button('Next').click());
    expect(container.textContent).toContain('Roof type'); // still on Home
    act(() => button('3Photos').click());
    await act(async () => {
      button('Save and continue').click();
    });
    expect(api.createLead).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Roof type'); // sent back to Home
  });

  it('asks for a roof, then sends a qualifying one with the lead', async () => {
    act(() => button('Next').click());
    expect(container.textContent).toContain('Pick the roof type');
    act(() => button('Shingle').click());
    // The mocked deck doesn't re-render on update; render again to read it.
    act(() => root.render(<LeadFormSlide onSaved={() => {}} />));
    act(() => button('Next').click());
    await act(async () => {
      button('Save and continue').click();
    });
    expect(api.createLead).toHaveBeenCalledTimes(1);
    expect(api.createLead.mock.calls[0][0]).toMatchObject({ roofType: 'shingle', first: 'Ana' });
  });
});

describe('LeadFormSlide after the lead is saved (review > Edit)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSaved = vi.fn();
  const SAVED = {
    first: 'Ana', last: 'Ruiz', address: '1 Main St', city: 'Fresno', state: 'CA', zip: '93701',
    phone: '5595551234', email: 'ana@example.com',
  };
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text));
  const render = (step: 'owner' | 'home' = 'owner') =>
    act(() => root.render(<LeadFormSlide startStep={step} onSaved={onSaved} />));

  beforeEach(() => {
    deck.state.photos = {};
    deck.state.leadId = 'lead1';
    deck.state.roofType = 'shingle';
    deck.state.lead = { ...SAVED };
    deck.state.savedContact = contactKey(SAVED);
    onSaved.mockReset();
    api.createLead.mockReset();
    api.updateLeadContact.mockReset().mockResolvedValue({ ok: true, data: { success: true } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    deck.state.leadId = null;
    deck.state.savedContact = null;
  });

  it('keeps the contact fields editable and, with nothing changed, Continue just goes back', async () => {
    render();
    expect(container.querySelector<HTMLInputElement>('#solar-first')!.disabled).toBe(false);
    await act(async () => {
      button('Continue')!.click();
    });
    expect(api.updateLeadContact).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('a changed phone or email is saved to the lead with Save changes', async () => {
    deck.state.lead = { ...SAVED, phone: '(559) 555-0199', email: 'ana.ruiz@example.com' };
    render();
    expect(container.textContent).toContain('Changes not saved yet.');
    expect(button('Continue')).toBeUndefined();
    await act(async () => {
      button('Save changes')!.click();
    });
    expect(api.updateLeadContact).toHaveBeenCalledWith('lead1', deck.state.lead);
    expect(api.createLead).not.toHaveBeenCalled();
    expect(deck.state.savedContact).toBe(contactKey(deck.state.lead));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('checks the change as on create before sending', async () => {
    deck.state.lead = { ...SAVED, email: 'ana@' };
    render();
    await act(async () => {
      button('Save changes')!.click();
    });
    expect(api.updateLeadContact).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Check the email');
  });

  it('shows the server refusal (a closed lead) and stays on the form', async () => {
    api.updateLeadContact.mockResolvedValue({
      ok: false, status: 409, error: 'This lead is closed, so its contact details can no longer be changed.',
    });
    deck.state.lead = { ...SAVED, last: 'Ruiz-Lopez' };
    render('home');
    await act(async () => {
      button('Save changes')!.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/This lead is closed/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(deck.state.savedContact).toBe(contactKey(SAVED));
  });

  it('Save changes then leaving the slide sends the change once', async () => {
    deck.state.lead = { ...SAVED, phone: '(559) 555-0199' };
    // As in the deck: onSaved moves to the review in the same batch, so the form unmounts at once.
    onSaved.mockImplementation(() => root.render(<p>review</p>));
    render();
    await act(async () => {
      button('Save changes')!.click();
    });
    expect(container.textContent).toBe('review');
    expect(api.updateLeadContact).toHaveBeenCalledTimes(1);
  });

  it('leaving the slide with a valid unsent change sends it quietly', async () => {
    deck.state.lead = { ...SAVED, first: 'Anita' };
    render();
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(api.updateLeadContact).toHaveBeenCalledWith('lead1', expect.objectContaining({ first: 'Anita' }));
  });
});
