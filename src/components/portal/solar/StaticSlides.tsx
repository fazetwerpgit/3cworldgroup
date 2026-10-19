import Image from 'next/image';
import s from './solarDeck.module.css';

// The deck's static slides, text verbatim from "3C Solar Pitch Deck.pptx";
// images are the deck's own, exported to public/solar.

export function IntroSlide() {
  return (
    <div className={s.hero}>
      <div className={s.head}>
        <p className={s.eyebrow}>3C World Group</p>
        <h1 className={`${s.title} ${s.heroTitle}`}>Giving clients the options they deserve!</h1>
      </div>
      <Image className={s.globe} src="/solar/globe.webp" alt="3C World Group" width={550} height={516} priority />
    </div>
  );
}

export function OptionsSlide() {
  return (
    <>
      <h2 className={s.title}>
        Time to take a look at <span className={s.accent}>your options!</span>
      </h2>
      <Image
        className={`${s.photo} ${s.photoWide}`}
        src="/solar/home.webp"
        alt="Brick home with solar panels on the roof"
        width={934}
        height={526}
        sizes="(max-width: 1180px) 100vw, 1180px"
      />
    </>
  );
}

export function PartnersSlide() {
  return (
    <>
      <h2 className={s.title}>We have partnered with</h2>
      <div className={s.partners}>
        <div>
          <Image src="/solar/globe.webp" alt="" width={550} height={516} sizes="320px" />
          <p className={s.partnerName}>3C World Group</p>
        </div>
        <span className={s.plus} aria-hidden>
          +
        </span>
        <div>
          <Image src="/solar/panel-module.webp" alt="Solar panel" width={290} height={174} />
          <p className={s.partnerName}>Bold Power</p>
        </div>
      </div>
    </>
  );
}

export function BillSlide() {
  return (
    <>
      <h2 className={s.title}>
        Evaluation of <span className={s.accent}>Your Bill</span>
      </h2>
      <div className={s.billGrid}>
        <Image src="/solar/bill-usage.webp" alt="Electric bill usage graph" width={973} height={596} sizes="(max-width: 820px) 100vw, 640px" />
        <Image
          className={s.billCharges}
          src="/solar/bill-charges.webp"
          alt="Electric bill delivery and generation charges"
          width={445}
          height={447}
          sizes="(max-width: 820px) 100vw, 520px"
        />
        <Image src="/solar/bill-tiers.webp" alt="Electric bill tier pricing" width={1067} height={226} sizes="(max-width: 820px) 100vw, 640px" />
      </div>
    </>
  );
}

const STEPS = [
  {
    n: 'STEP 01',
    title: 'Free Solar Consultation',
    kicker: 'Our experts do all the leg work.',
    body: 'A 3C expert creates a custom solar design and detailed solar proposal for your home, including an estimate of future savings and solar financing options. Let the excitement begin!',
  },
  {
    n: 'STEP 02',
    title: 'Design & Installation',
    kicker: 'Leave the heavy lifting to us.',
    body: "A trusted team of Bold Power certified solar installers make your solar dreams a reality. They'll even handle all of the permitting and paperwork.",
  },
  {
    n: 'STEP 03',
    title: 'Enjoy Your Savings!',
    kicker: 'Get ready to flip the switch.',
    body: "After inspections are complete and final connections are made to your local utility, it's time to shine with solar energy savings from 3C!",
  },
];

export function StepsSlide() {
  return (
    <>
      <h2 className={s.title}>
        Make the switch in <span className={s.accent}>three easy steps</span>
      </h2>
      <div className={s.cols}>
        {STEPS.map((step) => (
          <section key={step.n} className={s.col}>
            <span className={s.colNum}>{step.n}</span>
            <h3 className={s.colTitle}>{step.title}</h3>
            <p className={s.colKicker}>{step.kicker}</p>
            <p className={s.colBody}>{step.body}</p>
          </section>
        ))}
      </div>
    </>
  );
}

export function NeedsSlide() {
  return (
    <>
      <div className={s.head}>
        <h2 className={s.title}>
          What We Need to <span className={s.accent}>Get Started</span>
        </h2>
        <p className={s.lede}>Required customer details and bill documentation for your solar proposal</p>
      </div>
      <div className={s.cols}>
        <section className={s.col}>
          <span className={s.colNum}>SECTION 01</span>
          <h3 className={s.colTitle}>Contact Info</h3>
          <dl className={s.dl}>
            <div><dt>CUSTOMER NAME</dt><dd>Name</dd></div>
            <div><dt>PHONE NUMBER</dt><dd>Phone Number</dd></div>
            <div><dt>EMAIL ADDRESS</dt><dd>Email</dd></div>
            <div><dt>PROPERTY ADDRESS</dt><dd>Address</dd></div>
          </dl>
        </section>
        <section className={s.col}>
          <span className={s.colNum}>SECTION 02</span>
          <h3 className={s.colTitle}>Electric Bill Copies</h3>
          <ul className={s.tierList}>
            <li>Meter Number Pg. 1</li>
            <li>Bar Graph Pg. 3 &amp; Pg. 4</li>
          </ul>
          <div className={s.colImgs}>
            <Image className={s.colImg} src="/solar/meter.webp" alt="Electric meter" width={202} height={202} />
            <Image className={s.colImg} src="/solar/bill-graph.webp" alt="Bill usage bar graph" width={502} height={307} sizes="200px" />
          </div>
        </section>
        <section className={s.col}>
          <span className={s.colNum}>SECTION 03</span>
          <h3 className={s.colTitle}>Electric Panel</h3>
          <ul className={s.tierList}>
            <li>Photo of Electric Panel</li>
          </ul>
          <Image className={s.colImg} src="/solar/electric-panel.webp" alt="Open electric panel" width={800} height={800} sizes="(max-width: 820px) 100vw, 380px" />
        </section>
      </div>
    </>
  );
}

export function AppendixSlide() {
  return (
    <div className={s.hero}>
      <div className={s.head}>
        <p className={s.eyebrow}>3C World Group</p>
        <h2 className={`${s.title} ${s.heroTitle}`}>Appendix</h2>
      </div>
      <Image className={s.globe} src="/solar/globe.webp" alt="" width={550} height={516} />
    </div>
  );
}

type Row = { tag: string; title: string; body: string };

function RowsSlide({ title, accent, lede, rows }: { title: string; accent?: string; lede: string; rows: Row[] }) {
  return (
    <>
      <div className={s.head}>
        <h2 className={s.title}>
          {title}
          {accent ? <span className={s.accent}>{accent}</span> : null}
        </h2>
        <p className={s.lede}>{lede}</p>
      </div>
      <div className={s.rows}>
        {rows.map((row) => (
          <div key={row.tag} className={s.row}>
            <span className={s.rowTag}>{row.tag}</span>
            <div>
              <h3 className={s.rowTitle}>{row.title}</h3>
              <p className={s.rowBody}>{row.body}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function MovingSlide() {
  return (
    <RowsSlide
      title="You're Moving!"
      lede="Dedicated solar solutions tailored for your new property transition"
      rows={[
        {
          tag: 'DEDICATED SERVICE',
          title: 'Easier Solar Access Than Utilities',
          body: 'You will have a dedicated line to make going solar simpler and faster than traditional power companies.',
        },
        {
          tag: 'PROPERTY & EFFICIENCY BENEFITS',
          title: 'Green Energy & Home Value',
          body: 'Makes your home more efficient by adopting green alternatives while adding real market value and appeal to your property.',
        },
        {
          tag: 'COST SAVINGS',
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
      title="We Make the Process Fast!"
      lede="Streamlined, convenient, and customer-centered from start to finish."
      rows={[
        {
          tag: 'TIMELY & SCHEDULING',
          title: 'Fast & Convenient Setup',
          body: 'Quick turnaround times and flexible scheduling options tailored around your availability.',
        },
        {
          tag: 'HASSLE-FREE EXPERIENCE',
          title: 'Fun, Simple & Enjoyable',
          body: 'We eliminate unnecessary friction to deliver an easy and positive transition every step of the way.',
        },
        {
          tag: 'CUSTOMER COMMITMENT',
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
      title="We Will Beat Anybody's Prices!"
      lede="Unbeatable value, flexible programs, and maximum savings guaranteed"
      rows={[
        {
          tag: 'COMPETITIVE PRICING',
          title: 'Guaranteed Lowest Rates',
          body: 'We offer market-leading pricing structures to give you maximum value for your property.',
        },
        {
          tag: 'PROMOTIONAL MATCH',
          title: 'Match Other Promotions',
          body: 'Bring us any competitor proposal or promotional offer and we will match or beat it.',
        },
        {
          tag: 'ZERO DOWN FINANCING',
          title: 'No Money Out of Pocket Programs',
          body: 'Seamless transitions with accessible $0-down solar options tailored to your budget.',
        },
        {
          tag: 'TAX INCENTIVES',
          title: 'Tax Credit Optimization',
          body: 'Full guidance on qualifying and maximizing available federal and state solar tax credits.',
        },
        {
          tag: 'EXPERT GUIDANCE',
          title: 'Personalized Consultation',
          body: 'Schedule a one-on-one session to design a custom clean energy plan for your goals.',
        },
      ]}
    />
  );
}
