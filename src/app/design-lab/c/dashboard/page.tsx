import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Phone,
  Timer,
  TrendingUp,
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
import { Shell, TabBar, TopBar } from "../Chrome";
import { money, ordinal } from "../format";
import s from "../scoreboard.module.css";
import d from "../dashboard.module.css";

export const metadata = { title: "Dashboard · Scoreboard (C)" };

const statusCopy: Record<SaleStatus, string> = {
  installed: "Installed",
  scheduled: "Scheduled",
  "needs-date": "Needs install date",
  cancelled: "Cancelled",
};

type Sale = (typeof recentSales)[number];

function statusLine(sale: Sale) {
  if (sale.status === "installed") return `Installed ${sale.installDate}`;
  if (sale.status === "scheduled") return `Install ${sale.installDate}`;
  return statusCopy[sale.status];
}

function payLine(sale: Sale) {
  if (sale.status === "cancelled") return "No pay";
  if (!sale.payDate) return "After install";
  return sale.status === "installed"
    ? `Pays ${sale.payDate}`
    : `Est. ${sale.payDate}`;
}

export default function ScoreboardDashboard() {
  const period = [
    { key: "installed", n: payPeriod.installedCount, label: "installed" },
    { key: "scheduled", n: payPeriod.scheduledCount, label: "scheduled" },
    { key: "needs", n: payPeriod.needsDateCount, label: "needs a date" },
  ] as const;
  const periodTotal = period.reduce((a, p) => a + p.n, 0);
  const nextPoints = standing.points + standing.pointsBehindNext;
  const nextRank = standing.rank - 1;
  const gapPct = Math.round((standing.points / nextPoints) * 100);
  const toGo = challenge.goal - challenge.done;

  return (
    <Shell withTabbar>
      <TopBar section="home" />
      <main className={s.main}>
        <h1 className={s.srOnly}>{rep.firstName}&apos;s dashboard</h1>

        <div className={d.grid}>
          <div className={d.colMain}>
            {/* ---- 1. What am I getting paid, and when ---- */}
            <section
              className={`${s.panel} ${d.board}`}
              aria-label="Pay and rank"
            >
              <div className={d.cellPay}>
                <p className={s.kicker}>Est. pay this period</p>
                <p className={d.score}>{money(payPeriod.estimatedPay)}</p>
                <p className={d.delta}>
                  <TrendingUp size={16} strokeWidth={2.25} aria-hidden />
                  {payPeriod.vsLastPeriodPct}% vs last period
                </p>
              </div>

              <div className={d.cellRank}>
                <p className={s.kicker}>Weekly rank</p>
                <p className={`${d.score} ${d.rank}`}>
                  {standing.rank}
                  <span className={d.ord}>
                    {ordinal(standing.rank).slice(-2)}
                  </span>
                </p>
                <p className={d.sub}>
                  of {standing.of} · <strong>{standing.points} pts</strong>
                </p>
              </div>

              <div className={d.cellPeriod}>
                <div className={d.periodHead}>
                  <p className={s.kicker}>This pay period</p>
                  <p className={d.periodCount}>{periodTotal} sales</p>
                </div>
                <div className={d.stack} aria-hidden>
                  {period.map((p) =>
                    Array.from({ length: p.n }, (_, i) => (
                      <span
                        key={`${p.key}-${i}`}
                        className={d[`seg_${p.key}`]}
                      />
                    )),
                  )}
                </div>
                <ul className={d.legend}>
                  {period.map((p) => (
                    <li key={p.key}>
                      <span
                        className={`${d.swatch} ${d[`seg_${p.key}`]}`}
                        aria-hidden
                      />
                      <b>{p.n}</b> {p.label}
                    </li>
                  ))}
                </ul>
              </div>

              <Link href="#" className={d.payday}>
                <CalendarClock
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden
                  className={d.paydayIcon}
                />
                <span className={d.paydayText}>
                  <span className={s.kicker}>Next payday</span>
                  <span className={d.paydayDate}>{payPeriod.nextPayday}</span>
                </span>
                <span className={d.paydayAmt}>
                  {money(payPeriod.nextPaydayAmount)}
                </span>
                <ChevronRight size={20} aria-hidden className={d.chev} />
              </Link>
            </section>

            {/* ---- 4. Recent sales ---- */}
            <section
              className={`${s.panel} ${d.sales}`}
              aria-labelledby="sales-h"
            >
              <div className={s.panelHead}>
                <h2 id="sales-h" className={s.kicker}>
                  Recent sales
                </h2>
                <Link href="#" className={d.headLink}>
                  All sales
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </div>
              <div className={d.tableHead} aria-hidden>
                <span>Customer</span>
                <span>Plan</span>
                <span>Status</span>
                <span className={d.num}>Est. pay</span>
                <span className={d.num}>Pay date</span>
              </div>
              <ul className={d.saleList}>
                {recentSales.map((sale) => (
                  <li
                    key={sale.customer}
                    id={`sale-${sale.customer.toLowerCase()}`}
                    className={`${d.sale} ${sale.status === "cancelled" ? d.saleOff : ""}`}
                  >
                    <span className={d.saleWho}>
                      <span className={d.saleName}>{sale.customer}</span>
                      <span className={d.saleAddr}>{sale.address}</span>
                    </span>
                    <span className={d.salePlan}>{sale.plan}</span>
                    <span
                      className={`${d.status} ${d[`st_${sale.status.replace("-", "")}`]}`}
                    >
                      <span className={d.dot} aria-hidden />
                      {statusLine(sale)}
                    </span>
                    <span className={`${d.saleAmt} ${d.num}`}>
                      {sale.status === "cancelled" ? "—" : money(sale.estPay)}
                    </span>
                    <span className={`${d.saleWhen} ${d.num}`}>
                      {payLine(sale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className={d.colSide}>
            {/* ---- 2. Where do I stand ---- */}
            <section
              className={`${s.panel} ${d.race}`}
              aria-labelledby="race-h"
            >
              <div className={s.panelHead}>
                <h2 id="race-h" className={s.kicker}>
                  Where you stand
                </h2>
                <Link href="#" className={d.headLink}>
                  Leaderboard
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
              </div>
              <ol className={d.ladder}>
                <li className={d.rung}>
                  <span className={d.rungPos}>{nextRank}</span>
                  <span className={d.rungName}>{standing.nextName}</span>
                  <span className={d.rungPts}>
                    {nextPoints}
                    <small> pts</small>
                  </span>
                </li>
                <li className={`${d.rung} ${d.rungYou}`} aria-current="true">
                  <span className={d.rungPos}>{standing.rank}</span>
                  <span className={d.rungName}>You</span>
                  <span className={d.rungPts}>
                    {standing.points}
                    <small> pts</small>
                  </span>
                </li>
              </ol>
              <div className={d.gap}>
                <div className={s.track} aria-hidden>
                  <span className={s.fill} style={{ width: `${gapPct}%` }} />
                </div>
                <p className={d.gapText}>
                  <strong>{standing.pointsBehindNext} pts</strong> to pass{" "}
                  {standing.nextName} for {ordinal(nextRank)}
                </p>
              </div>
            </section>

            <section
              className={`${s.panel} ${d.challenge}`}
              aria-labelledby="ch-h"
            >
              <div className={s.panelHead}>
                <h2 id="ch-h" className={s.kicker}>
                  Weekly challenge
                </h2>
                <span className={d.clock}>
                  <Timer size={16} aria-hidden />
                  {challenge.timeLeft}
                </span>
              </div>
              <div className={d.challengeBody}>
                <div className={d.challengeTop}>
                  <p className={d.challengeTitle}>{challenge.label}</p>
                  <p
                    className={d.challengeScore}
                    aria-label={`${challenge.done} of ${challenge.goal}`}
                  >
                    {challenge.done}
                    <span>/{challenge.goal}</span>
                  </p>
                </div>
                <div className={d.ticks} aria-hidden>
                  {Array.from({ length: challenge.goal }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < challenge.done
                          ? i === challenge.done - 1
                            ? d.tickLead
                            : d.tickOn
                          : undefined
                      }
                    />
                  ))}
                </div>
                <p className={d.gapText}>
                  <strong>{toGo} more</strong> to close it out
                </p>
              </div>
            </section>

            {/* ---- 3. What's next today ---- */}
            <section
              className={`${s.panel} ${d.today}`}
              aria-labelledby="today-h"
            >
              <div className={s.panelHead}>
                <h2 id="today-h" className={s.kicker}>
                  Today
                </h2>
              </div>
              <ul className={d.todayList}>
                {today.map((t) =>
                  t.kind === "call" ? (
                    <li key={t.title} className={d.todayRow}>
                      <span className={d.todayTime}>{t.time}</span>
                      <span className={d.todayTitle}>{t.title}</span>
                      <Link
                        href="#"
                        className={s.btnSecondary + " " + d.todayBtn}
                      >
                        <Phone size={16} aria-hidden />
                        Join
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={t.title}
                      className={`${d.todayRow} ${d.todayAction}`}
                    >
                      <span className={d.todayTime}>{t.time}</span>
                      <span className={d.todayTitle}>{t.title}</span>
                      <Link
                        href="#sale-okafor"
                        className={s.btnSecondary + " " + d.todayBtn}
                      >
                        Add date
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          </div>
        </div>
      </main>
      <TabBar section="home" />
    </Shell>
  );
}
