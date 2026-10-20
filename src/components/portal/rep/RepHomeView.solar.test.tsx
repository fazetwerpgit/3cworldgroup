import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RepHomeView, SolarWeekSection, type RepHomeViewProps } from './RepDashboard';

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

  it('dual rep: the solar section sits directly under pay, above Ask and the fiber week', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({ solarWeek: <div data-solar-week /> })} />);
    const pay = html.indexOf('No sales yet.');
    const week = html.indexOf('data-solar-week');
    expect(pay).toBeGreaterThan(-1);
    expect(week).toBeGreaterThan(pay);
    expect(week).toBeLessThan(html.indexOf('data-ask'));
    expect(week).toBeLessThan(html.indexOf('This week'));
  });

  it('solar-only rep: the week numbers under the deck and next consultation, above Ask', () => {
    const html = renderToStaticMarkup(
      <RepHomeView
        {...props({ solarOnly: true, solarEntry: <div data-solar />, solarNext: <div data-next />, solarWeek: <div data-solar-week /> })}
      />
    );
    expect(html.indexOf('data-next')).toBeLessThan(html.indexOf('data-solar-week'));
    expect(html.indexOf('data-solar-week')).toBeLessThan(html.indexOf('data-ask'));
  });
});

describe('SolarWeekSection', () => {
  const base = { timeLeft: '2 days left', onRetry: vi.fn() };

  it('dual: Solar, the three numbers, the next consultation and Open deck to the deck', () => {
    const html = renderToStaticMarkup(
      <SolarWeekSection {...base} variant="dual" state={{ status: 'ready', data: { set: 4, demoed: 2, closed: 1 } }} next={<div data-next />} />
    );
    expect(html).toContain('>Solar<');
    expect(html).toContain('4 appointments set this week');
    expect(html).toContain('2 demoed this week');
    expect(html).toContain('1 closed this week');
    expect(html.indexOf('>Set<')).toBeLessThan(html.indexOf('>Demoed<'));
    expect(html.indexOf('>Demoed<')).toBeLessThan(html.indexOf('>Closed<'));
    expect(html).toContain('data-next');
    expect(html).toContain('href="/portal/solar/present"');
    expect(html).toContain('Open deck');
  });

  it('solar-only: This week, numbers only (the deck and next consultation are above it)', () => {
    const html = renderToStaticMarkup(
      <SolarWeekSection {...base} variant="solarOnly" state={{ status: 'ready', data: { set: 0, demoed: 0, closed: 0 } }} next={<div data-next />} />
    );
    expect(html).toContain('>This week<');
    expect(html).toContain('0 appointments set this week');
    expect(html).not.toContain('data-next');
    expect(html).not.toContain('Open deck');
  });

  it('loading: a skeleton per number, labels kept, the section busy', () => {
    const html = renderToStaticMarkup(<SolarWeekSection {...base} variant="dual" state={{ status: 'loading' }} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading appointments set');
    expect(html).toContain('>Closed<');
  });

  it('error: one retry line instead of the numbers', () => {
    const html = renderToStaticMarkup(<SolarWeekSection {...base} variant="dual" state={{ status: 'error' }} />);
    expect(html).toContain('your solar numbers');
    expect(html).toContain('Try again');
    expect(html).not.toContain('>Demoed<');
    expect(html).toContain('Open deck');
  });
});
