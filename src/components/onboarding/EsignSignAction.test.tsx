// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EsignSignAction } from './EsignSignAction';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('EsignSignAction', () => {
  it('links Sign now to the in-app signing page', async () => {
    await act(async () => {
      root.render(<EsignSignAction signPath="/portal/onboarding/sign/env-1" />);
    });

    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Sign now');
    expect(link?.getAttribute('href')).toBe('/portal/onboarding/sign/env-1');
  });
});
