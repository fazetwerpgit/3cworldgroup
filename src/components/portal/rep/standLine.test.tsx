import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Standing } from '@/lib/dashboard/repSummary';
import { standLine } from './RepDashboard';

const line = (s: Partial<Standing>) =>
  renderToStaticMarkup(<>{standLine({ rank: 4, of: 14, points: 34, ahead: null, leadBy: null, tiedWith: null, movement: null, ...s })}</>);

describe('standLine fallback', () => {
  it('says top of the board only for rank 1', () => {
    expect(line({ rank: 1 })).toBe('Top of the board this week');
  });

  it('never tells a lower rank it is on top when the rep above is unknown', () => {
    expect(line({ rank: 4 })).toBe('Keep climbing');
  });

  it('still names the gap when the rep above is known', () => {
    expect(line({ ahead: { name: 'Sam T.', rank: 3, points: 42, gap: 8 } })).toContain('behind Sam T. for #');
  });
});
