// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/esign/PdfPages', () => ({ default: () => <div data-testid="pdf" /> }));
vi.mock('@/components/esign/SignaturePad', () => ({ default: () => <div data-testid="pad" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { InviteSignAll } from './InviteSignAll';
import { saveSignature } from '@/components/esign/signatureStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function doc(itemId: string, label: string, state = 'ready') {
  return {
    itemId,
    label,
    state,
    envelope:
      state === 'ready'
        ? {
            envelopeId: `env-${itemId}`,
            // A document with no one-of rules, so an empty form is complete.
            docKey: 'contract',
            name: label,
            status: 'sent',
            pageCount: 1,
            signerName: 'Casey Hire',
            signerEmail: 'casey@example.com',
            fields: [],
          }
        : null,
  };
}

const VIEW = {
  signerName: 'Casey Hire',
  documents: [doc('w9', 'W-9'), doc('contract', 'Contract'), doc('direct_deposit', 'Direct Deposit')],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let signAnswers: Record<string, Array<() => Response>>;
const signedEnvelopes: string[] = [];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
  window.scrollTo = vi.fn();
  saveSignature({ png: PNG, method: 'draw' });
  signAnswers = {};
  signedEnvelopes.length = 0;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>)['x-onboard-signing-key']).toBe('key-1');
    if (url.endsWith('/esign')) return json(VIEW);
    if (url.endsWith('/esign/sign')) {
      const { envelopeId } = JSON.parse(String(init?.body)) as { envelopeId: string };
      signedEnvelopes.push(envelopeId);
      const next = signAnswers[envelopeId]?.shift();
      return next ? next() : json({ completed: true, allSigned: false });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(onSessionLost = vi.fn()) {
  await act(async () => {
    root.render(<InviteSignAll token="token-1" signingKey="key-1" onSessionLost={onSessionLost} />);
  });
  return onSessionLost;
}

const button = (text: RegExp) =>
  [...container.querySelectorAll('button')].find((el) => text.test(el.textContent ?? '')) as HTMLButtonElement;

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

describe('InviteSignAll', () => {
  it('will not sign while a document still needs information, and opens it', async () => {
    VIEW.documents[0] = { ...doc('w9', 'W-9'), envelope: { ...doc('w9', 'W-9').envelope!, docKey: 'w9' } };
    try {
      await render();
      await click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
      await click(button(/Sign all 3 documents/));
      expect(signedEnvelopes).toEqual([]);
      expect(container.textContent).toContain('W-9: Enter your SSN or EIN.');
      expect(container.querySelector('[data-testid="pdf"]')).toBeTruthy();
    } finally {
      VIEW.documents[0] = doc('w9', 'W-9');
    }
  });

  it('lists every document and offers one button for all of them', async () => {
    await render();
    expect(container.textContent).toContain('W-9');
    expect(container.textContent).toContain('Contract');
    expect(container.textContent).toContain('Direct Deposit');
    expect(button(/Sign all 3 documents/)).toBeTruthy();
  });

  it('will not sign before the consent box is checked', async () => {
    await render();
    await click(button(/Sign all 3 documents/));
    expect(signedEnvelopes).toEqual([]);
    expect(container.textContent).toContain('agree to sign electronically');
  });

  it('reports a failed document, keeps the rest signed, and retries just that one', async () => {
    signAnswers['env-contract'] = [
      () => json({ error: 'upload failed' }, 502),
      () => json({ completed: true, allSigned: true }),
    ];
    await render();
    await click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);

    await click(button(/Sign all 3 documents/));

    expect(signedEnvelopes).toEqual(['env-w9', 'env-contract', 'env-direct_deposit']);
    expect(container.textContent).toContain('Contract was not signed. Everything else is signed.');
    expect(container.textContent).toContain('Not signed. Server hiccup. Try again.');
    expect(button(/Sign 1 document/)).toBeTruthy();
    expect(container.textContent).not.toContain('all set');

    await click(button(/Retry/));

    expect(signedEnvelopes).toEqual(['env-w9', 'env-contract', 'env-direct_deposit', 'env-contract']);
    expect(container.textContent).toContain('You’re all set');
  });

  it('counts an already-signed answer as signed', async () => {
    signAnswers['env-w9'] = [() => json({ error: 'already completed' }, 409)];
    await render();
    await click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await click(button(/Sign all 3 documents/));
    expect(container.textContent).toContain('You’re all set');
  });

  it('hands back to the portal when the signing session is gone', async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: 'signing session expired' }, 401));
    const lost = await render();
    expect(lost).toHaveBeenCalled();
  });

  it('shows the done screen when the server says everything is signed', async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: 'all documents signed', done: true }, 409));
    await render();
    expect(container.textContent).toContain('You’re all set');
  });
});
