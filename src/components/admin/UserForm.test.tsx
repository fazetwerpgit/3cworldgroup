// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { User } from '@/types';

const auth = vi.hoisted(() => ({ user: { uid: 'admin-1', role: 'admin' } as Record<string, unknown> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

import { UserForm } from './UserForm';

const DIRECTORY = [
  { uid: 'gm', displayName: 'Gina GM', fieldRole: 'general_manager', status: 'active' },
  { uid: 'om', displayName: 'Omar Office', fieldRole: 'office_manager', status: 'active' },
  { uid: 'ibo', displayName: 'Ivy IBO', fieldRole: 'ibo_level_2', status: 'active' },
  { uid: 'admin-2', displayName: 'Ada Admin', role: 'admin', status: 'active' },
  { uid: 'gone-owner', displayName: 'Old Owner', role: 'owner', status: 'inactive' },
  { uid: 'new-ops', displayName: 'Pending Ops', role: 'operations', status: 'pending' },
  { uid: 'rep-2', displayName: 'Rita Rep', fieldRole: 'entry_rep', status: 'active' },
];

let container: HTMLDivElement;
let root: Root;
let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<unknown>>;

async function mount(user: Partial<User>) {
  await act(async () => {
    root.render(<UserForm user={{ uid: 'target', email: 't@x.test', status: 'active', ...user } as User} />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function putBody() {
  const init = fetchMock.mock.calls.find(([, call]) => call?.method === 'PUT')?.[1];
  return JSON.parse(String(init?.body));
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  auth.user = { uid: 'admin-1', role: 'admin' };
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => (init?.method ? { success: true } : { users: DIRECTORY }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('UserForm manager picker', () => {
  it('offers active GMs, office managers and IBO tiers, never inactive or pending people', async () => {
    await mount({ fieldRole: 'entry_rep' });
    const search = container.querySelector('#manager-search') as HTMLInputElement;
    await act(async () => {
      search.focus();
    });

    const names = [...container.querySelectorAll('[aria-label="Managers"] li')].map((li) => li.textContent);
    expect(names.join('|')).toContain('Gina GM');
    expect(names.join('|')).toContain('Omar Office');
    expect(names.join('|')).toContain('Ivy IBO');
    expect(names.join('|')).toContain('Ada Admin');
    expect(names.join('|')).not.toContain('Old Owner');
    expect(names.join('|')).not.toContain('Pending Ops');
    expect(names.join('|')).not.toContain('Rita Rep');
  });

  it('names the current manager even when they are no longer eligible', async () => {
    await mount({ fieldRole: 'entry_rep', reportsToId: 'gone-owner' });

    await act(async () => {
      await vi.waitFor(() =>
        expect((container.querySelector('#manager-search') as HTMLInputElement).value).toBe('Old Owner')
      );
    });
  });

  it('does not re-send the stored manager on a name-only save', async () => {
    await mount({ fieldRole: 'entry_rep', displayName: 'Rep', reportsToId: 'gm' });

    await type(container.querySelector('#person-name') as HTMLInputElement, 'Rep Renamed');
    await act(async () => {
      button('Save changes')!.click();
    });

    expect(putBody()).toMatchObject({ displayName: 'Rep Renamed' });
    expect(putBody()).not.toHaveProperty('managerId');
  });

  it('sends null when the manager is cleared', async () => {
    await mount({ fieldRole: 'entry_rep', reportsToId: 'gm' });

    await act(async () => {
      button('Clear manager')!.click();
    });
    await act(async () => {
      button('Save changes')!.click();
    });

    expect(putBody()).toMatchObject({ managerId: null });
  });
});

describe('UserForm role and actions', () => {
  it("shows an admin's real role to an operations viewer instead of the first option", async () => {
    auth.user = { uid: 'ops-1', role: 'operations' };
    await mount({ role: 'admin' });

    const select = container.querySelector('#person-role') as HTMLSelectElement;
    expect(select.value).toBe('admin');
    expect(select.selectedOptions[0].textContent).toBe('Administrator');
    expect(select.selectedOptions[0].disabled).toBe(true);
  });

  it('hides Delete from operations and shows it to admins', async () => {
    auth.user = { uid: 'ops-1', role: 'operations' };
    await mount({ fieldRole: 'director' });
    expect(button('Delete')).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(container);
    auth.user = { uid: 'admin-1', role: 'admin' };
    await mount({ fieldRole: 'director' });
    expect(button('Delete')).toBeDefined();
  });

  it('hides Deactivate on your own record', async () => {
    await mount({ uid: 'admin-1', role: 'admin' });
    expect(button('Deactivate')).toBeUndefined();

    act(() => root.unmount());
    root = createRoot(container);
    await mount({ uid: 'someone-else', fieldRole: 'entry_rep' });
    expect(button('Deactivate')).toBeDefined();
  });
});
