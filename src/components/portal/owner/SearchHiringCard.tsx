'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import type { Section } from '@/hooks/useRepDashboard';
import { useMinuteClock } from '@/components/leaderboard/belowPodium';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { findMarket } from '@/app/_cinematic/markets';
import {
  changePct,
  changeText,
  channelParts,
  searchErrorText,
  timeAgo,
  totalOf,
} from '@/lib/search/searchCardFormat';
import type { JobPageStatus, SearchStatsResponse, SearchStatsView } from '@/lib/search/searchStatsTypes';
import s from '../rep/rep.module.css';
import c from './search-card.module.css';

// The owner's "Hiring from search" card: where this week's applications came
// from, how the site did on Google search, and whether each job page is on
// Google yet. OWNER ONLY (rendered by OwnerDashboard; the API refuses anyone
// else). Every number comes from /api/portal/owner/search-stats; until the
// daily Search Console pull has run, the card says so instead of showing zeros.

const count = (n: number) => n.toLocaleString('en-US');

function useSearchStats() {
  const [state, setState] = useState<Section<SearchStatsResponse>>({ status: 'loading' });
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async ({ quiet = false } = {}) => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    const token = await getIdToken().catch(() => null);
    try {
      const response = await fetch('/api/portal/owner/search-stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: mine.signal,
      });
      const data = (await response.json().catch(() => null)) as (SearchStatsResponse & { error?: string }) | null;
      if (!response.ok || !data?.applications) throw new Error(data?.error || `Request failed (${response.status})`);
      if (!mine.signal.aborted) setState({ status: 'ready', data });
    } catch (error) {
      if (mine.signal.aborted) return;
      console.error('Hiring from search failed:', error);
      setState((prev) => (quiet && prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void run();
  }, [run]);
  const refresh = useCallback(() => void run({ quiet: true }), [run]);
  useRefreshOnResume(refresh);

  return { state, retry };
}

// ---------------------------------------------------------------- lines

function Change({ current, prior }: { current?: number; prior?: number }) {
  const pct = changePct(current, prior);
  if (pct === null) return null;
  return (
    <span className={`${c.change} ${pct < 0 ? c.changeDown : ''}`}>
      <span className={s.srOnly}> (</span>
      {changeText(pct)}
      <span className={s.srOnly}> vs the prior week)</span>
    </span>
  );
}

function ApplicationsLine({ data }: { data: SearchStatsResponse['applications'] }) {
  const parts = channelParts(data.last7);
  const total30 = totalOf(data.last30);
  return (
    <div className={c.row}>
      <p className={c.label}>Applications, last 7 days</p>
      <p className={c.value}>
        {/* The dot trails each item, so a wrapped line never starts with one. */}
        {parts.map((part, i) => (
          <span key={part.key} className={c.item}>
            {part.name} <strong>{count(part.count)}</strong>
            {i < parts.length - 1 ? <span className={c.sep} aria-hidden="true">·</span> : null}
          </span>
        ))}
      </p>
      <p className={c.muted}>
        {count(total30)} in the last 30 days
      </p>
    </div>
  );
}

function GoogleLine({ search }: { search: SearchStatsView }) {
  if (typeof search.impressions7 !== 'number' || typeof search.clicks7 !== 'number') return null;
  return (
    <div className={c.row}>
      <p className={c.label}>Google search, last 7 days</p>
      <p className={c.value}>
        <span className={c.item}>
          <strong>{count(search.impressions7)}</strong> showings
          <Change current={search.impressions7} prior={search.impressionsPrev7} />
          <span className={c.sep} aria-hidden="true">·</span>
        </span>
        <span className={c.item}>
          <strong>{count(search.clicks7)}</strong> {search.clicks7 === 1 ? 'click' : 'clicks'}
          <Change current={search.clicks7} prior={search.clicksPrev7} />
        </span>
      </p>
    </div>
  );
}

const cityName = (slug: string) => findMarket(slug)?.name ?? slug;

function JobPagesLine({ pages }: { pages: JobPageStatus[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const indexed = pages.filter((page) => page.indexed).length;
  return (
    <div className={`${c.row} ${c.rowJobs}`}>
      <button
        type="button"
        className={c.toggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={c.label}>Job pages on Google</span>
        <span className={c.toggleValue}>
          <strong>{indexed}</strong> of {pages.length}
          <ChevronDown size={16} aria-hidden="true" className={`${c.chevron} ${open ? c.chevronOpen : ''}`} />
        </span>
      </button>
      <ul id={listId} className={c.cities} hidden={!open}>
        {pages.map((page) => (
          <li key={page.slug} className={c.city}>
            <span className={c.cityName}>{cityName(page.slug)}</span>
            <span className={c.cityState}>
              <span className={page.indexed ? c.yes : c.notYet}>{page.indexed ? 'Indexed' : 'Not yet'}</span>
              {page.jobPostingValid ? (
                <>
                  <span className={c.sep} aria-hidden="true">·</span>
                  <span className={c.yes}>Job listing valid</span>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopSearches({ search }: { search: SearchStatsView }) {
  const top = (search.topQueries ?? []).slice(0, 3);
  if (!top.length) return null;
  return (
    <div className={`${c.row} ${c.rowWide}`}>
      <p className={c.label}>Top searches, last 28 days</p>
      <p className={c.queries}>
        {top.map((q, i) => (
          <span key={q.query} className={c.query}>
            {i > 0 ? <span className={c.sep} aria-hidden="true">·</span> : null}
            {q.query}
          </span>
        ))}
      </p>
    </div>
  );
}

function Footer({ search }: { search: SearchStatsView | null }) {
  const now = useMinuteClock();
  if (!search) return null;
  const updated = timeAgo(search.updatedAt, now);
  const failedNote = !search.ok && updated ? searchErrorText(search.error) : null;
  const checked = !updated ? timeAgo(search.checkedAt, now) : null;
  if (!updated && !checked) return null;
  return (
    <p className={c.foot}>
      {updated ? `Updated ${updated}` : `Last checked ${checked}`}
      {failedNote ? <span className={c.footWarn}> · {failedNote}</span> : null}
    </p>
  );
}

// ---------------------------------------------------------------- card

function Body({ data }: { data: SearchStatsResponse }) {
  const search = data.search;
  // Figures exist once a run has succeeded; a later failure keeps them.
  const hasFigures = Boolean(search?.updatedAt) && typeof search?.impressions7 === 'number';
  return (
    <>
      <div className={c.rows}>
        <ApplicationsLine data={data.applications} />
        {!search ? (
          <p className={`${c.row} ${c.state}`}>First update arrives tomorrow morning</p>
        ) : !hasFigures ? (
          <p className={`${c.row} ${c.state} ${search.ok ? '' : c.stateWarn}`}>
            {search.ok ? 'First update arrives tomorrow morning' : searchErrorText(search.error)}
          </p>
        ) : (
          <>
            <GoogleLine search={search} />
            {search.jobPages?.length ? <JobPagesLine pages={search.jobPages} /> : null}
            <TopSearches search={search} />
          </>
        )}
      </div>
      <Footer search={search} />
    </>
  );
}

export function SearchHiringCard({ className = '' }: { className?: string }) {
  const { state, retry } = useSearchStats();
  return (
    <section className={`${s.panel} ${c.card} ${className}`} aria-labelledby="search-hiring-h" aria-busy={state.status === 'loading' || undefined}>
      <div className={s.panelHead}>
        <h2 id="search-hiring-h" className={s.kicker}>
          Hiring from search
        </h2>
      </div>
      {state.status === 'loading' ? (
        <div className={c.skel}>
          <span className={`${s.skel} ${c.skelRow}`} />
          <span className={`${s.skel} ${c.skelRow}`} />
        </div>
      ) : state.status === 'error' ? (
        <div className={s.failed} role="alert">
          <span>Couldn&apos;t load hiring from search</span>
          <button type="button" className={s.retry} onClick={retry}>
            <RotateCw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        <Body data={state.data} />
      )}
    </section>
  );
}
