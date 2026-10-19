// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/onboarding/InviteSignAll', () => ({ InviteSignAll: () => <div data-testid="sign-all" /> }));
vi.mock('@/lib/onboarding/rememberedInvite', () => ({ forgetInvite: vi.fn(), rememberInvite: vi.fn() }));
// A stand-in Attachment whose button starts an upload that never settles, so
// the form sees one request in flight through the real useUploadsInFlight.
vi.mock('@/components/portal/rep/RepForm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/portal/rep/RepForm')>();
  return {
    ...actual,
    Attachment: ({ id, onBusyChange }: { id: string; onBusyChange?: (busy: boolean) => void }) => (
      <button type="button" data-testid={id} onClick={() => onBusyChange?.(true)}>
        Pick
      </button>
    ),
  };
});

import PublicOnboardingPage from './page';
import { UPLOADING_MESSAGE } from '@/components/portal/rep/RepForm';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invite = {
  invite: {
    id: 'inv-1',
    candidateName: 'Casey Hire',
    candidateEmail: 'casey@example.com',
    candidatePhone: '5555550100',
    candidateCity: 'Chicago',
    intendedFieldRole: 'entry_rep',
    isIBO: true,
    status: 'sent',
    ownerName: 'Owner',
    expiresAt: null,
  },
  items: [
    {
      id: 'insurance',
      label: 'Proof of Insurance',
      category: 'business',
      appliesToRoles: [],
      iboOnly: true,
      sensitive: false,
      referenceKind: 'storage',
      order: 10,
    },
  ],
  locked: false,
};

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<PublicOnboardingPage />);
  });
  await act(async () => {});
}

function submitForm() {
  const form = container.querySelector('form')!;
  return act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('PublicOnboardingPage', () => {
  it('shows the friendly load error when the API answers with an HTML error page', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!DOCTYPE html><html><body>Gateway Timeout</body></html>', {
        status: 504,
        headers: { 'Content-Type': 'text/html' },
      })
    );
    await render();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Couldn't load onboarding link");
    expect(container.textContent).not.toContain('JSON');
  });

  it('shows the friendly submit error when the POST answers with an HTML error page', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(invite), { status: 200 }))
      .mockResolvedValueOnce(new Response('<!DOCTYPE html><html>Request Entity Too Large</html>', { status: 413 }));
    await render();
    await submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Couldn't submit onboarding");
    expect(container.textContent).not.toContain('JSON');
  });

  it('blocks Submit while an upload is still in flight', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(invite), { status: 200 }));
    await render();
    const pick = container.querySelector<HTMLButtonElement>('[data-testid="onboard-upload-insurance"]')!;
    await act(async () => {
      pick.click();
    });
    await submitForm();
    // Only the invite load went out: no packet with a missing or stale file path.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(UPLOADING_MESSAGE);
  });
});
