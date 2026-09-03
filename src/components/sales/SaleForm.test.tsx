// @vitest-environment jsdom
//
// Covers the install-date -> sale-date inference on the new-sale form: an
// install that already happened back-dates the sale to it (the same rule the
// POST route applies when no sale date is sent), a today or future install (the
// normal "sold now, installs later" case) does not, and the rep's own edit ends
// the auto-fill for good.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com' } }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ createSale: vi.fn(), loading: false, error: null }),
}));
vi.mock('@/components/sales/PlanPicker', () => ({
  PlanPicker: () => <div data-testid="plan-picker" />,
}));
vi.mock('@/components/onboarding/FileUpload', () => ({
  default: () => <div data-testid="file-upload" />,
}));
vi.mock('@/lib/firebase/config', () => ({ auth: null }));

import { SaleForm } from './SaleForm';
import { todaySaleDateInput } from '@/lib/sales/saleDate';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthOffset(months: number, day: number) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(day);
  return dateInput(date);
}

function dayOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInput(date);
}

function field(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

// React tracks the last value it set, so a controlled input only sees a change
// when the native setter is used before dispatching.
async function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function saleDateHint() {
  return field('saleDate').parentElement!.querySelector('.sales-line-field-hint')!.textContent ?? '';
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SaleForm />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('SaleForm sale date', () => {
  it('defaults to today', () => {
    expect(field('saleDate').value).toBe(todaySaleDateInput());
    expect(field('saleDate').max).toBe(todaySaleDateInput());
  });

  it('back-dates the sale to an install date in a past month', async () => {
    const lastMonth = monthOffset(-1, 12);
    await setValue(field('installDate'), lastMonth);

    expect(field('saleDate').value).toBe(lastMonth);
    expect(saleDateHint()).toContain('Dated to the install day');
  });

  it('back-dates the sale to an install date earlier this week too', async () => {
    // Day resolution, not month: a two-day-old install must hand the rep the
    // right date rather than trip the sale-after-install guard on submit.
    const recent = dayOffset(-2);
    await setValue(field('installDate'), recent);

    expect(field('saleDate').value).toBe(recent);
    expect(saleDateHint()).toContain('Dated to the install day');
  });

  it('leaves the sale on today for a future install month', async () => {
    await setValue(field('installDate'), monthOffset(1, 8));

    expect(field('saleDate').value).toBe(todaySaleDateInput());
    expect(saleDateHint()).toContain('not the install day');
  });

  it('leaves the sale on today for an install scheduled today', async () => {
    await setValue(field('installDate'), todaySaleDateInput());

    expect(field('saleDate').value).toBe(todaySaleDateInput());
    expect(saleDateHint()).toContain('not the install day');
  });

  it('resets an auto-filled sale date when the install moves forward', async () => {
    await setValue(field('installDate'), dayOffset(-3));
    await setValue(field('installDate'), dayOffset(4));

    expect(field('saleDate').value).toBe(todaySaleDateInput());
    expect(saleDateHint()).toContain('not the install day');
  });

  it('stops auto-filling once the rep sets the sale date themselves', async () => {
    const chosen = monthOffset(-1, 3);
    await setValue(field('saleDate'), chosen);
    await setValue(field('installDate'), dayOffset(-2));

    expect(field('saleDate').value).toBe(chosen);
    expect(saleDateHint()).toContain('not the install day');
  });
});
