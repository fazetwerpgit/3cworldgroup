import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({ default: () => <img alt="" /> }));

import MarketJobPage, { generateMetadata, generateStaticParams } from './page';
import { MARKETS } from '../../../_cinematic/markets';
import { DATE_POSTED, MARKET_JOBS, VALID_THROUGH, jobPostingJsonLd } from '../../../_cinematic/marketJobs';

const render = async (slug: string) =>
  renderToStaticMarkup(await MarketJobPage({ params: Promise.resolve({ slug }) }));

/** The page's visible text, without its tags and with the JSON-LD block taken out. */
const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('market job postings', () => {
  it('has one posting per market, and a page for each', () => {
    expect(MARKET_JOBS.map((job) => job.slug)).toEqual(MARKETS.map((market) => market.slug));
    expect(generateStaticParams()).toEqual(MARKETS.map((market) => ({ slug: market.slug })));
  });

  it.each(MARKET_JOBS.map((job) => [job.slug, job] as const))('%s carries the JobPosting fields Google requires', (_slug, job) => {
    const posting = jobPostingJsonLd(job);
    expect(posting).toMatchObject({
      '@type': 'JobPosting',
      title: job.role,
      datePosted: DATE_POSTED,
      validThrough: VALID_THROUGH,
      employmentType: 'CONTRACTOR',
      directApply: true,
      hiringOrganization: {
        '@type': 'Organization',
        name: '3C World Group',
        sameAs: 'https://www.3cworldgroup.com',
        logo: 'https://www.3cworldgroup.com/logo.png',
      },
    });
    const places = posting.jobLocation as { address: Record<string, string> }[];
    expect(places.length).toBeGreaterThan(0);
    for (const place of places) {
      expect(place).toMatchObject({ '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'US' } });
      expect(place.address.addressLocality).toBeTruthy();
      expect(place.address.addressRegion).toBeTruthy();
    }
    expect(posting).not.toHaveProperty('baseSalary');
    expect(typeof posting.description).toBe('string');
  });

  it.each(MARKET_JOBS.map((job) => [job.slug, job] as const))('%s shows every line its description states', async (slug, job) => {
    const text = visibleText(await render(slug));
    const description = visibleText(String(jobPostingJsonLd(job).description));
    expect(text).toContain(`${job.role} in ${job.place}`);
    for (const line of [job.intro, ...job.terms.flatMap((term) => [term.title, term.body])]) {
      expect(description).toContain(line);
      expect(text).toContain(line);
    }
  });

  it('lists each Southern California city as its own location', () => {
    const job = MARKET_JOBS.find((entry) => entry.slug === 'southern-california')!;
    expect(jobPostingJsonLd(job).jobLocation).toEqual(
      ['Los Angeles', 'Ontario', 'Riverside', 'San Bernardino', 'Anaheim', 'San Diego'].map((city) => ({
        '@type': 'Place',
        address: { '@type': 'PostalAddress', addressLocality: city, addressRegion: 'CA', addressCountry: 'US' },
      })),
    );
  });

  it('runs 90 days from the posting date', () => {
    const days = (Date.parse(VALID_THROUGH) - Date.parse(DATE_POSTED)) / 86_400_000;
    expect(days).toBe(90);
  });

  it('never says fiber or names a person for Dallas', async () => {
    const dallas = MARKET_JOBS.find((entry) => entry.slug === 'dallas')!;
    const html = await render('dallas');
    expect(`${html} ${dallas.metaTitle} ${dallas.metaDescription}`.toLowerCase()).not.toContain('fiber');
    expect(html).not.toContain('Will');
  });

  it('links Apply to the market prefill and canonicalises to its own URL', async () => {
    const html = await render('grand-rapids');
    expect(html).toContain('href="/apply?market=grand-rapids"');
    expect(html).toContain('href="/opportunities"');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'grand-rapids' }) });
    expect(metadata.alternates?.canonical).toBe('/opportunities/grand-rapids');
    expect(metadata.title).toBe('Fiber Internet Sales Jobs in Grand Rapids, MI | 3C World Group');
  });
});
