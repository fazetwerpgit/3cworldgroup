// @vitest-environment jsdom
//
// Coverage for the exact branch implicated in the correctness review's
// finding 5: MemberLineOnboardingBoard's `item.esignSigningUrl ? <EsignSignAction/>
// : <fallback note>` decision (the checklist sheet body) had no test at all,
// so a ternary inversion or a copy regression would pass the full suite
// unnoticed. This also covers the "no-URL dead end" honesty requirement:
// a no-URL item with esignDispatch.state === 'failed' must show the failure
// copy, and a no-URL item with no failure recorded must show the normal
// "preparing" copy - never the other way around.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MemberLineOnboardingBoard from './MemberLineOnboardingBoard';
import type { WizardItem } from './OnboardingWizard';
import { ESIGN_FAILURE_HELPER_TEXT, ESIGN_HELPER_TEXT } from '@/lib/onboarding/esign';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function makeItem(overrides: Partial<WizardItem> = {}): WizardItem {
  return {
    id: 'contract',
    label: 'Contract',
    category: 'paperwork',
    appliesToRoles: [],
    iboOnly: false,
    sensitive: false,
    referenceKind: 'esign',
    order: 5,
    status: 'not_started',
    reference: null,
    rejectionReason: null,
    reviewerName: null,
    esignDispatch: null,
    esignSigningUrl: null,
    ...overrides,
  };
}

async function renderBoard(item: WizardItem) {
  await act(async () => {
    root.render(
      <MemberLineOnboardingBoard
        memberLabel="Sam Rep"
        items={[item]}
        progress={{ approved: 0, total: 1, complete: false }}
        renderItemAction={() => null}
        openItemId={item.id}
        onOpenItem={() => {}}
        onRefresh={() => {}}
      />
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

// The row description (outside the sheet) always shows ESIGN_HELPER_TEXT or
// ESIGN_FAILURE_HELPER_TEXT for any non-approved esign item regardless of URL
// presence - that's a separate, unrelated branch (rowDescription). These
// assertions scope to the open sheet body itself, the exact branch finding 5
// flagged as untested.
function sheetText(): string {
  return container.querySelector('.member-line-sheet')?.textContent ?? '';
}

describe('MemberLineOnboardingBoard esign sheet body', () => {
  it('renders the Sign now action when a signing url is present', async () => {
    await renderBoard(makeItem({ status: 'submitted', esignSigningUrl: 'https://www.signwell.com/e/abc' }));

    expect(container.querySelector('button.bg-\\[\\#8dc63f\\]')?.textContent).toContain('Sign now');
    expect(sheetText()).not.toContain(ESIGN_HELPER_TEXT);
    expect(sheetText()).not.toContain(ESIGN_FAILURE_HELPER_TEXT);
  });

  it('shows the normal preparing copy when there is no url and no recorded failure', async () => {
    await renderBoard(makeItem({ status: 'submitted', esignSigningUrl: null, esignDispatch: null }));

    expect(sheetText()).toContain(ESIGN_HELPER_TEXT);
    expect(sheetText()).not.toContain(ESIGN_FAILURE_HELPER_TEXT);
    // No signing url means no EsignSignAction - never a "Sign now" button.
    expect(container.querySelector('button.bg-\\[\\#8dc63f\\]')).toBeNull();
  });

  it('shows the honest failure copy when there is no url and the dispatch is marked failed', async () => {
    await renderBoard(
      makeItem({
        status: 'submitted',
        esignSigningUrl: null,
        esignDispatch: { state: 'failed', attempts: 1 },
      })
    );

    expect(sheetText()).toContain(ESIGN_FAILURE_HELPER_TEXT);
    expect(sheetText()).not.toContain(ESIGN_HELPER_TEXT);
  });
});
