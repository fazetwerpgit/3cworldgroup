import type { ReactNode } from 'react';
import Image from 'next/image';
import s from './staticSlides.module.css';

// The deck's static slides, text verbatim from "3C Solar Pitch Deck.pptx",
// laid out as "Design B": light page, two-tone titles, blue numerals, hairline
// rules. Photos live in public/solar/b (the Design B set) and public/solar.

function Title({ dark, blue }: { dark: string; blue: string }) {
  return (
    <h2 className={s.title}>
      {dark} <span className={s.blue}>{blue}</span>
    </h2>
  );
}

function Page({ title, lede, children }: { title: ReactNode; lede?: string; children: ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.head}>
        {title}
        {lede ? <p className={s.lede}>{lede}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function IntroSlide() {
  return (
    <div className={s.split}>
      <div className={s.splitText}>
        <span className={s.dash} aria-hidden />
        <h1 className={`${s.title} ${s.display}`}>
          3C
          <br />
          <span className={s.blue}>World Group</span>
        </h1>
        <hr className={s.shortRule} />
        <p className={s.tagline}>Giving clients the options they deserve!</p>
      </div>
      <div className={s.globeDisc}>
        <Image className={s.globe} src="/solar/b/globe.webp" alt="3C World Group globe logo" width={640} height={600} sizes="(max-width: 820px) 60vw, 360px" priority />
      </div>
    </div>
  );
}

export function OptionsSlide() {
  return (
    <div className={`${s.split} ${s.splitPhoto}`}>
      <div className={s.splitText}>
        <span className={s.dash} aria-hidden />
        <h2 className={`${s.title} ${s.display}`}>
          Time to take a look at <span className={s.blue}>your options!</span>
        </h2>
      </div>
      <figure className={s.framed}>
        <Image
          src="/solar/b/house.webp"
          alt="Two-story home with solar panels on the roof"
          width={1100}
          height={619}
          sizes="(max-width: 820px) 100vw, 640px"
        />
      </figure>
    </div>
  );
}

export function PartnersSlide() {
  return (
    <Page title={<Title dark="We have" blue="partnered with" />}>
      <div className={s.partners}>
        <div className={s.card}>
          <div className={s.partnerArt}>
            <Image src="/solar/b/globe.webp" alt="" width={640} height={600} sizes="200px" />
          </div>
          <p className={s.partnerName}>3C World Group</p>
        </div>
        <span className={s.plus} aria-label="and">
          +
        </span>
        <div className={s.card}>
          <div className={s.partnerArt}>
            <Image src="/solar/b/panel.webp" alt="Solar panel" width={800} height={480} sizes="320px" />
          </div>
          <p className={s.partnerName}>Bold Energy</p>
          <p className={s.partnerNote}>Certified solar installers</p>
        </div>
      </div>
    </Page>
  );
}

export function BillSlide() {
  return (
    <Page title={<Title dark="Evaluation of" blue="Your Bill" />}>
      <div className={s.bill}>
        <div className={s.billStack}>
          <div className={`${s.card} ${s.billCard}`}>
            <Image src="/solar/b/usage.webp" alt="Electric bill usage graph" width={1000} height={613} sizes="(max-width: 820px) 100vw, 640px" />
          </div>
          <div className={`${s.card} ${s.billCard}`}>
            <Image src="/solar/b/tiers.webp" alt="Electric bill tier pricing" width={900} height={191} sizes="(max-width: 820px) 100vw, 640px" />
          </div>
        </div>
        <div className={`${s.card} ${s.billCard} ${s.billCharges}`}>
          <Image
            src="/solar/b/charges.webp"
            alt="Electric bill delivery and generation charges"
            width={900}
            height={896}
            sizes="(max-width: 820px) 100vw, 480px"
          />
        </div>
      </div>
    </Page>
  );
}

const STEPS = [
  {
    title: 'Free Solar Consultation',
    kicker: 'Our experts do all the legwork.',
    body: 'A 3C expert creates a custom solar design and detailed solar proposal for your home, including an estimate of future savings and solar financing options. Let the excitement begin!',
  },
  {
    title: 'Design & Installation',
    kicker: 'Leave the heavy lifting to us.',
    body: "A trusted team of Bold Energy certified solar installers makes your solar dreams a reality. They'll even handle all of the permitting and paperwork.",
  },
  {
    title: 'Enjoy Your Savings!',
    kicker: 'Get ready to flip the switch.',
    body: "After inspections are complete and final connections are made to your local utility, it's time to shine with solar energy savings from 3C!",
  },
];

const num = (i: number) => String(i + 1).padStart(2, '0');

export function StepsSlide() {
  return (
    <Page title={<Title dark="Make the switch in" blue="three easy steps" />}>
      <ol className={s.cols}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={s.col}>
            <span className={s.eyebrow}>Step</span>
            <span className={s.numeral}>{num(i)}</span>
            <h3 className={s.colTitle}>{step.title}</h3>
            <p className={s.kicker}>{step.kicker}</p>
            <p className={s.body}>{step.body}</p>
          </li>
        ))}
      </ol>
    </Page>
  );
}

export function NeedsSlide() {
  return (
    <Page
      title={<Title dark="What We Need to" blue="Get Started" />}
      lede="Required customer details and bill documentation for your solar proposal"
    >
      <div className={s.cols}>
        <section className={s.col}>
          <span className={s.eyebrow}>Section</span>
          <span className={s.numeral}>01</span>
          <h3 className={s.colTitle}>Contact Info</h3>
          <dl className={s.fields}>
            <div><dt>Customer name</dt><dd>Name</dd></div>
            <div><dt>Phone number</dt><dd>Phone Number</dd></div>
            <div><dt>Email address</dt><dd>Email</dd></div>
            <div><dt>Property address</dt><dd>Address</dd></div>
          </dl>
        </section>
        <section className={s.col}>
          <span className={s.eyebrow}>Section</span>
          <span className={s.numeral}>02</span>
          <h3 className={s.colTitle}>Electric Bill Copies</h3>
          <ul className={s.docs}>
            <li>
              <Image className={s.docImg} src="/solar/b/meter.webp" alt="Electric meter" width={420} height={420} sizes="104px" />
              <p>
                Meter Number <span className={s.blue}>Pg. 1</span>
              </p>
            </li>
            <li>
              <Image className={s.docImg} src="/solar/bill-graph.webp" alt="Bill usage bar graph" width={502} height={307} sizes="104px" />
              <p>
                Bar Graph <span className={s.blue}>Pg. 3 &amp; Pg. 4</span>
              </p>
            </li>
          </ul>
        </section>
        <section className={s.col}>
          <span className={s.eyebrow}>Section</span>
          <span className={s.numeral}>03</span>
          <h3 className={s.colTitle}>Electric Panel</h3>
          <Image
            className={s.panelImg}
            src="/solar/b/breaker.webp"
            alt="Open electric panel"
            width={700}
            height={700}
            sizes="(max-width: 820px) 100vw, 320px"
          />
          <p className={s.caption}>Photo of Electric Panel</p>
        </section>
      </div>
    </Page>
  );
}

// Appendix, Moving, Fast and Price are off the deck (owner, 2026-10-20) but
// kept here so they can go back in: re-add them to SolarPresenter's ORDER.
export function AppendixSlide() {
  return (
    <div className={s.appendix}>
      <div className={s.appendixDisc}>
        <Image className={s.appendixGlobe} src="/solar/b/globe.webp" alt="" width={640} height={600} sizes="80px" />
        <p className={s.appendixBrand}>3C World Group</p>
        <h2 className={s.appendixTitle}>
          <span className={s.blue}>A</span>ppendix
        </h2>
        <span className={s.dash} aria-hidden />
      </div>
    </div>
  );
}

type Row = { tag: string; title: string; body: string };

function RowsSlide({ title, accent, lede, rows }: { title: string; accent: string; lede: string; rows: Row[] }) {
  const dense = rows.length > 3;
  const item = (row: Row, i: number) => (
    <li key={row.tag} className={`${s.col} ${dense ? s.colInline : ''}`}>
      <span className={s.numeral}>{num(i)}</span>
      <span className={s.eyebrow}>{row.tag}</span>
      <h3 className={s.colTitle}>{row.title}</h3>
      <p className={s.body}>{row.body}</p>
    </li>
  );
  return (
    <Page title={<Title dark={title} blue={accent} />} lede={lede}>
      <ol className={`${s.cols} ${dense ? s.colsDense : ''}`}>{rows.slice(0, 3).map(item)}</ol>
      {dense ? (
        <ol className={`${s.cols} ${s.colsDense} ${s.colsRest}`} start={4}>
          {rows.slice(3).map((row, i) => item(row, i + 3))}
        </ol>
      ) : null}
    </Page>
  );
}

export function MovingSlide() {
  return (
    <RowsSlide
      title="You're"
      accent="Moving!"
      lede="Dedicated solar solutions tailored for your new property transition"
      rows={[
        {
          tag: 'Dedicated service',
          title: 'Easier Solar Access Than Utilities',
          body: 'You will have a dedicated line to make going solar simpler and faster than traditional power companies.',
        },
        {
          tag: 'Property & efficiency benefits',
          title: 'Green Energy & Home Value',
          body: 'Makes your home more efficient by adopting green alternatives while adding real market value and appeal to your property.',
        },
        {
          tag: 'Cost savings',
          title: 'Wholesale vs. Retail Advantage',
          body: 'Lock in direct wholesale pricing instead of paying standard retail utility rates.',
        },
      ]}
    />
  );
}

export function FastSlide() {
  return (
    <RowsSlide
      title="We Make the"
      accent="Process Fast!"
      lede="Streamlined, convenient, and customer-centered from start to finish."
      rows={[
        {
          tag: 'Timely & scheduling',
          title: 'Fast & Convenient Setup',
          body: 'Quick turnaround times and flexible scheduling options tailored around your availability.',
        },
        {
          tag: 'Hassle-free experience',
          title: 'Fun, Simple & Enjoyable',
          body: 'We eliminate unnecessary friction to deliver an easy and positive transition every step of the way.',
        },
        {
          tag: 'Customer commitment',
          title: 'Putting Your Needs First',
          body: 'Most of all, we always prioritize your satisfaction and look forward to being of service to you!',
        },
      ]}
    />
  );
}

export function PriceSlide() {
  return (
    <RowsSlide
      title="We Will"
      accent="Beat Anybody's Prices!"
      lede="Unbeatable value, flexible programs, and maximum savings guaranteed"
      rows={[
        {
          tag: 'Competitive pricing',
          title: 'Guaranteed Lowest Rates',
          body: 'We offer market-leading pricing structures to give you maximum value for your property.',
        },
        {
          tag: 'Promotional match',
          title: 'Match Other Promotions',
          body: 'Bring us any competitor proposal or promotional offer and we will match or beat it.',
        },
        {
          tag: 'Zero down financing',
          title: 'No Money Out of Pocket Programs',
          body: 'Seamless transitions with accessible $0-down solar options tailored to your budget.',
        },
        {
          tag: 'Tax incentives',
          title: 'Tax Credit Optimization',
          body: 'Full guidance on qualifying and maximizing available federal and state solar tax credits.',
        },
        {
          tag: 'Expert guidance',
          title: 'Personalized Consultation',
          body: 'Schedule a one-on-one session to design a custom clean energy plan for your goals.',
        },
      ]}
    />
  );
}
