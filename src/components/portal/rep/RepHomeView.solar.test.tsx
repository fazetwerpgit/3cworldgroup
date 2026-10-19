import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RepHomeView, type RepHomeViewProps } from './RepDashboard';

// Solar on Home: a dual rep keeps the fiber Home with the Solar card beside
// Ask; a solar-only rep's Home leads with Solar and has no fiber parts.
function props(over: Partial<RepHomeViewProps>): RepHomeViewProps {
  return {
    firstName: 'Sol',
    payStatus: 'ready',
    pay: null,
    hasPlan: true,
    zeroSales: true,
    canLog: true,
    carrierFailed: false,
    standing: { status: 'loading' },
    challenge: { status: 'loading' },
    timeLeft: '2d',
    rows: [],
    todayItems: [],
    todayLoading: false,
    extraDates: 0,
    callsFailed: false,
    askEntry: <div data-ask />,
    onHelp: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe('RepHomeView and Solar', () => {
  it('dual rep: the fiber Home plus the Solar card', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({ solarEntry: <div data-solar /> })} />);
    expect(html).toContain('data-solar');
    expect(html).toContain('No sales yet.');
    expect(html).toContain('Log your first sale');
    expect(html).toContain('This week');
  });

  it('fiber-only rep: no Solar at all', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({})} />);
    expect(html).not.toContain('data-solar');
    expect(html).toContain('No sales yet.');
  });

  it('solar-only rep: Solar leads, Ask stays, every fiber part is gone', () => {
    const html = renderToStaticMarkup(
      <RepHomeView {...props({ solarOnly: true, solarEntry: <div data-solar />, pay: null, payStatus: 'loading' })} />
    );
    expect(html.indexOf('data-solar')).toBeGreaterThan(-1);
    expect(html.indexOf('data-solar')).toBeLessThan(html.indexOf('data-ask'));
    expect(html).not.toContain('No sales yet.');
    expect(html).not.toContain('Log your first sale');
    expect(html).not.toContain('This week');
    expect(html).not.toContain('Estimated pay');
    expect(html).toContain('Sol&#x27;s dashboard');
  });

  it('solar-only rep: the next consultation sits under the deck, above Ask', () => {
    const html = renderToStaticMarkup(
      <RepHomeView
        {...props({
          solarOnly: true,
          solarEntry: <div data-solar />,
          solarNext: <div data-next />,
        })}
      />
    );
    expect(html.indexOf('data-solar')).toBeLessThan(html.indexOf('data-next'));
    expect(html.indexOf('data-next')).toBeLessThan(html.indexOf('data-ask'));
  });

  it('a dual rep never gets the next consultation on Home', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({ solarEntry: <div data-solar />, solarNext: <div data-next /> })} />);
    expect(html).not.toContain('data-next');
  });
});
