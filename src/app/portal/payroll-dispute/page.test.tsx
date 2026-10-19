// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AttachmentProps = {
  upload: (file: File, signal: AbortSignal) => Promise<string>;
  onUploaded: (path: string) => void;
};

const t = vi.hoisted(() => ({
  attachment: null as AttachmentProps | null,
  uploadFormAttachment: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'rep-1', displayName: 'Ada Rep', email: 'ada@example.com' } }),
}));
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: { getIdToken: async () => 'token' } },
}));
vi.mock('@/hooks/useFormOptions', () => ({ useFormOptions: () => ({ options: { payrollCampaigns: [] } }) }));
vi.mock('@/lib/forms/uploadFormAttachment', () => ({ uploadFormAttachment: t.uploadFormAttachment }));
vi.mock('@/components/portal/rep/RepShell', () => ({
  RepShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/portal/rep/RepForm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/portal/rep/RepForm')>();
  return {
    ...actual,
    // Only the upload wiring is under test: skip field validation and the shell chrome.
    useFormCheck: () => ({ errors: {}, validate: () => true, clear: () => {}, reset: () => {} }),
    FormFrame: ({ formId, onSubmit, children }: { formId: string; onSubmit: (e: React.FormEvent) => void; children: ReactNode }) => (
      <form id={formId} onSubmit={onSubmit}>
        {children}
        <button type="submit">Send dispute</button>
      </form>
    ),
    Attachment: (props: AttachmentProps) => {
      t.attachment = props;
      return null;
    },
  };
});

import PayrollDisputePage from './page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  t.attachment = null;
  t.uploadFormAttachment.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'ref-1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function submittedPath() {
  await act(async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).orderScreenshotPath;
}

describe('payroll dispute proof', () => {
  it('sends the attached proof path', async () => {
    await act(async () => root.render(<PayrollDisputePage />));
    await act(async () => t.attachment!.onUploaded('form-attachments/rep-1/payroll-dispute/u1/'));
    expect(await submittedPath()).toBe('form-attachments/rep-1/payroll-dispute/u1/');
  });

  it('drops the old proof path when a Replace fails', async () => {
    await act(async () => root.render(<PayrollDisputePage />));
    await act(async () => t.attachment!.onUploaded('form-attachments/rep-1/payroll-dispute/u1/'));
    t.uploadFormAttachment.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      await t.attachment!.upload(new File(['b'], 'b.png'), new AbortController().signal).catch(() => {});
    });
    expect(await submittedPath()).toBe('');
  });

  it('drops the old proof path when a Replace is cancelled mid-upload', async () => {
    await act(async () => root.render(<PayrollDisputePage />));
    await act(async () => t.attachment!.onUploaded('form-attachments/rep-1/payroll-dispute/u1/'));
    // Never settles: the rep taps Cancel, so onUploaded is never called.
    t.uploadFormAttachment.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      void t.attachment!.upload(new File(['b'], 'b.png'), new AbortController().signal);
    });
    expect(await submittedPath()).toBe('');
  });
});
