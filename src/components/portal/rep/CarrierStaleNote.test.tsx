import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarrierStaleNote } from './CarrierStaleNote';

const NOW = new Date('2026-10-10T14:00:00.000Z');
const H = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('CarrierStaleNote', () => {
  it('renders nothing when the report is fresh', () => {
    const html = renderToStaticMarkup(
      <CarrierStaleNote report={{ lastReportAt: ago(3 * H), lastReportAsOf: '2026-10-09' }} now={NOW} className="meta" />
    );
    expect(html).toBe('');
  });

  it('renders nothing before the status loads', () => {
    expect(renderToStaticMarkup(<CarrierStaleNote report={null} now={NOW} />)).toBe('');
  });

  it('renders the one muted line when the report is late', () => {
    const html = renderToStaticMarkup(
      <CarrierStaleNote report={{ lastReportAt: ago(31 * H), lastReportAsOf: '2026-10-08' }} now={NOW} className="meta" />
    );
    expect(html).toBe('<p class="meta">Carrier update delayed · install info as of Thu 10/8</p>');
  });
});
