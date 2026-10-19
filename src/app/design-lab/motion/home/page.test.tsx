import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const search = { value: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

import Page from './page';

// The server render must already reflect ?state=, or the client's first render
// (which used to read window.location) disagrees and React drops the tree.
describe('motion/home harness ?state=', () => {
  afterEach(() => {
    search.value = '';
  });

  it('ready by default: the TODAY call shows', () => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('Team huddle');
  });

  it('?state=loading renders the loading view on the server', () => {
    search.value = 'state=loading';
    const html = renderToStaticMarkup(<Page />);
    expect(html).not.toContain('Team huddle');
  });
});
