import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  ChevronRight,
  Clock,
  Trophy,
  Video,
} from "lucide-react";
import {
  challenge,
  payPeriod,
  recentSales,
  rep,
  standing,
  today,
  type SaleStatus,
} from "../../_mock";
import n from "../native.module.css";
import d from "../dashboard.module.css";
import { money } from "./format";

const STATUS: Record<
  SaleStatus,
  { cls: string; text: (date: string | null) => string }
> = {
  installed: { cls: d.stInstalled, text: (date) => `Installed ${date}` },
  scheduled: { cls: d.stScheduled, text: (date) => `Installs ${date}` },
  "needs-date": { cls: d.stNeeds, text: () => "Needs install date" },
  cancelled: { cls: d.stCancelled, text: () => "Cancelled" },
};

function payDateText(status: SaleStatus, payDate: string | null) {
  if (status === "cancelled") return "No pay";
  if (!payDate) return "Not scheduled";
  return `Pays ${payDate}`;
}

function Ring({ done, goal }: { done: number; goal: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <svg className={d.ring} viewBox="0 0 68 68" aria-hidden>
      <circle cx="34" cy="34" r={r} className={d.ringTrack} />
      <circle
        cx="34"
        cy="34"
        r={r}
        className={d.ringFill}
        strokeDasharray={`${(done / goal) * c} ${c}`}
        transform="rotate(-90 34 34)"
      />
    </svg>
  );
}

export function DashboardView() {
  const needsDate = recentSales.find((s) => s.status === "needs-date");
  const toGo = challenge.goal - challenge.done;
  const mix = [
    ...Array<string>(payPeriod.installedCount).fill(d.stInstalled),
    ...Array<string>(payPeriod.scheduledCount).fill(d.stScheduled),
    ...Array<string>(payPeriod.needsDateCount).fill(d.stNeeds),
  ];

  return (
    <div className={d.page}>
      <header className={d.header}>
        <div>
          <p className={d.eyebrow}>Monday, September 22</p>
          <h1 className={d.largeTitle}>Hi, {rep.firstName}</h1>
        </div>
        <Link
          href="#"
          className={`${n.avatar} ${d.headerAvatar}`}
          aria-label="Profile"
        >
          {rep.initials}
        </Link>
      </header>

      <div className={d.grid}>
        {/* 1 — What am I getting paid, and when */}
        <section className={d.payArea} aria-label="Pay">
          <div className={d.payCard}>
            <div className={d.payMain}>
              <div className={d.payTop}>
                <p className={d.payLabel}>Estimated pay this period</p>
                <p className={d.payAmount}>{money(payPeriod.estimatedPay)}</p>
                <p className={d.payTrend}>
                  <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden />
                  {payPeriod.vsLastPeriodPct}% more than last period
                </p>
              </div>

              <div className={d.payday}>
                <span className={`${n.tile} ${n.tileLime}`} aria-hidden>
                  <CalendarPlus size={18} strokeWidth={2} />
                </span>
                <div className={n.rowText}>
                  <span className={d.paydayLabel}>Next payday</span>
                  <span className={d.paydayDate}>{payPeriod.nextPayday}</span>
                </div>
                <span className={d.paydayAmount}>
                  {money(payPeriod.nextPaydayAmount)}
                </span>
              </div>
            </div>

            <div className={d.mix} aria-hidden>
              {mix.map((cls, i) => (
                <i key={i} className={cls} />
              ))}
            </div>

            <dl className={d.counts}>
              <div>
                <dt>
                  <i className={`${d.dot} ${d.stInstalled}`} aria-hidden />
                  Installed
                </dt>
                <dd>{payPeriod.installedCount}</dd>
              </div>
              <div>
                <dt>
                  <i className={`${d.dot} ${d.stScheduled}`} aria-hidden />
                  Scheduled
                </dt>
                <dd>{payPeriod.scheduledCount}</dd>
              </div>
              <div>
                <dt>
                  <i className={`${d.dot} ${d.stNeeds}`} aria-hidden />
                  Needs date
                </dt>
                <dd>{payPeriod.needsDateCount}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 2 — Where do I stand */}
        <section className={d.standArea} aria-label="Where you stand">
          <div className={n.sectionHead}>
            <h2 className={n.sectionTitle}>Where you stand</h2>
            <Link href="#" className={n.textAction}>
              Leaderboard
            </Link>
          </div>

          <div className={d.tiles}>
            <div className={d.statTile}>
              <p className={d.statLabel}>
                <Trophy size={16} strokeWidth={2.25} aria-hidden />
                Rank · {standing.period.toLowerCase()}
              </p>
              <p className={d.statValue}>
                #{standing.rank}
                <span className={d.statOf}> of {standing.of}</span>
              </p>
            </div>
            <div className={d.statTile}>
              <p className={d.statLabel}>Points</p>
              <p className={d.statValue}>{standing.points}</p>
            </div>
            <p className={d.gap}>
              <strong>{standing.pointsBehindNext} pts</strong> behind{" "}
              {standing.nextName} for #{standing.rank - 1}
            </p>
          </div>

          <div className={d.challenge}>
            <div className={d.ringWrap}>
              <Ring done={challenge.done} goal={challenge.goal} />
              <span className={d.ringText}>
                {challenge.done}
                <span className={d.ringOf}>/{challenge.goal}</span>
              </span>
            </div>
            <div className={n.rowText}>
              <span className={d.challengeEyebrow}>Weekly challenge</span>
              <span className={n.rowTitle}>{challenge.label}</span>
              <span className={d.challengeMeta}>
                <span>{toGo} more to go</span>
                <span className={d.challengeTime}>
                  <Clock size={14} strokeWidth={2.25} aria-hidden />
                  {challenge.timeLeft}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* 3 — What's next today */}
        <section className={d.todayArea} aria-label="Today">
          <div className={n.sectionHead}>
            <h2 className={n.sectionTitle}>Today</h2>
          </div>
          <div className={n.group}>
            {today.map((item) =>
              item.kind === "call" ? (
                <Link
                  key={item.title}
                  href="#"
                  className={`${n.row} ${n.rowTiled}`}
                >
                  <span className={`${n.tile} ${n.tileBlue}`} aria-hidden>
                    <Video size={18} strokeWidth={2} />
                  </span>
                  <span className={n.rowText}>
                    <span className={n.rowTitle}>{item.title}</span>
                    <span className={n.rowSub}>Starts {item.time}</span>
                  </span>
                  <ChevronRight size={20} className={n.chevron} aria-hidden />
                </Link>
              ) : (
                <Link
                  key={item.title}
                  href="#"
                  className={`${n.row} ${n.rowTiled}`}
                >
                  <span className={`${n.tile} ${n.tileAmber}`} aria-hidden>
                    <CalendarPlus size={18} strokeWidth={2} />
                  </span>
                  <span className={n.rowText}>
                    <span className={n.rowTitle}>{item.title}</span>
                    {needsDate && (
                      <span className={n.rowSub}>
                        <span className={d.todayNow}>{item.time}</span> ·{" "}
                        {needsDate.customer}, {needsDate.plan}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={20} className={n.chevron} aria-hidden />
                </Link>
              ),
            )}
          </div>
        </section>

        {/* 4 — Recent sales */}
        <section className={d.salesArea} aria-label="Recent sales">
          <div className={n.sectionHead}>
            <h2 className={n.sectionTitle}>Recent sales</h2>
            <Link href="#" className={n.textAction}>
              See all
            </Link>
          </div>
          <div className={`${n.group} ${d.sales}`}>
            <div className={d.salesHead} aria-hidden>
              <span>Customer</span>
              <span>Plan</span>
              <span>Status</span>
              <span className={d.right}>Est. pay</span>
              <span className={d.right}>Pay date</span>
            </div>
            {recentSales.map((s) => {
              const st = STATUS[s.status];
              return (
                <Link
                  key={s.customer}
                  href="#"
                  className={`${n.row} ${d.sale}`}
                >
                  <span className={d.saleName}>{s.customer}</span>
                  <span className={d.saleAddr}>{s.address}</span>
                  <span className={d.salePlan}>{s.plan}</span>
                  <span className={`${d.saleStatus} ${st.cls}`}>
                    <i className={d.dot} aria-hidden />
                    {st.text(s.installDate)}
                  </span>
                  <span
                    className={
                      s.status === "cancelled"
                        ? `${d.salePay} ${d.salePayVoid}`
                        : d.salePay
                    }
                  >
                    {money(s.estPay)}
                  </span>
                  <span className={d.saleWhen}>
                    {payDateText(s.status, s.payDate)}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className={n.groupFoot}>
            Estimates. Pay lands about 14 days after install.
          </p>
        </section>
      </div>
    </div>
  );
}
