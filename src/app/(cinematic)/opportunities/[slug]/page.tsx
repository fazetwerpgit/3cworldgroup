import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import JsonLdScript from "../../../_cinematic/JsonLdScript";
import { MARKET_JOBS, findMarketJob, jobPostingJsonLd, marketJobPath } from "../../../_cinematic/marketJobs";
import { applyHrefForMarket } from "../../../_cinematic/markets";
import kit from "../../../_cinematic/cinematic.module.css";
import styles from "../careers.module.css";

/**
 * One opening, one market: /opportunities/dallas and its four siblings. A job
 * posting, not a city page — the role, what you sell there, how training and
 * leads work there, who leads it where that is known, and the pay structure.
 * The words live in _cinematic/marketJobs.ts, which also builds the
 * JobPosting data, so the page and the posting cannot say different things.
 *
 * Built from /opportunities' own pieces: the photographic page head with the
 * market's photograph, then the glance grid on paper.
 */

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return MARKET_JOBS.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = findMarketJob((await params).slug);
  if (!found) return {};
  const { job } = found;
  return {
    title: job.metaTitle,
    description: job.metaDescription,
    alternates: { canonical: marketJobPath(job.slug) },
  };
}

export default async function MarketJobPage({ params }: { params: Promise<Params> }) {
  const found = findMarketJob((await params).slug);
  if (!found) notFound();
  const { job, market } = found;
  const applyHref = applyHrefForMarket(market.slug);

  return (
    <>
      <JsonLdScript data={jobPostingJsonLd(job)} />

      <header className={kit.pageHead}>
        <div className={kit.pageHeadArt}>
          <Image src={market.image} alt="" fill priority sizes="100vw" className={kit.pageHeadImage} />
        </div>
        <div className={kit.pageHeadScrim} aria-hidden="true" />

        <div className={kit.pageHeadInner}>
          <div className={kit.pageHeadCol}>
            <p className={kit.pageHeadEyebrow}>Now hiring</p>
            <h1 className={`${kit.pageHeadTitle} ${styles.marketTitle}`}>
              {job.role}
              <span className={kit.pageHeadLime}>in {job.place}</span>
            </h1>
            <p className={kit.pageHeadLede}>{job.intro}</p>
            <div className={kit.pageHeadActions}>
              <Link href={applyHref} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start your application
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.glance} aria-label={`The ${market.name} opening`}>
        <div className={kit.shell}>
          <ul className={styles.glanceGrid}>
            {job.terms.map((term) => (
              <li key={term.title} className={styles.glanceItem}>
                <h2 className={styles.glanceItemTitle}>{term.title}</h2>
                <p className={styles.glanceItemBody}>{term.body}</p>
              </li>
            ))}
          </ul>

          <div className={styles.marketFoot}>
            <Link href={applyHref} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
              Start your application
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
            </Link>
            <Link href="/opportunities" className={kit.quietLinkInk}>
              Back to careers
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
