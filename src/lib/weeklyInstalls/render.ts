import type { RepDigest } from '@/lib/weeklyInstalls/digest';
import { formatDay, formatRange, type DayKey } from '@/lib/weeklyInstalls/week';

// The Monday email, rendered. Pure: a digest and a base URL in, subject + HTML +
// plain text out. It never sends, never reads Firestore, never reads the clock.
//
// Rules the copy keeps (Jacob, owner-approved):
//   - every dollar figure says "est."
//   - a payout is only ever a RANGE ("Oct 7–11"), never one date
//   - an amount that can't be computed from real rates is left out, not guessed
//
// Built for Gmail and iOS Mail: tables, inline styles, no web fonts, no images,
// no media queries doing anything load-bearing. Everything also reads fine as
// the plain-text part.

export interface WeeklyInstallsEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderOptions {
  /** Absolute origin for links, e.g. https://www.3cworldgroup.com (no trailing slash). */
  baseUrl: string;
}

/** Production origin. Links in an email must never point at a dev box. */
export const PRODUCTION_SITE_URL = 'https://www.3cworldgroup.com';

/** APP_BASE_URL when it is a real public origin, else production. */
export function emailBaseUrl(env: string | undefined = process.env.APP_BASE_URL): string {
  const value = (env ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(value) || /localhost|127\.0\.0\.1/.test(value)) return PRODUCTION_SITE_URL;
  return value;
}

export const SALES_PATH = '/portal/sales';
export const DISPUTE_PATH = '/portal/payroll-dispute';

export const DISCLAIMER =
  "Estimates only. You're paid when 3C receives funds from the carrier; missed installs are settled as claims by the 25th of the next month.";

const NAVY = '#061735';
const LIME = '#8dc63f';
const INK_2 = '#4a5775';
const INK_3 = '#7a849a';
const RULE = '#e4e8ee';
const PAGE = '#eef1f4';
const LIME_WASH = '#f3f9ea';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** "$420", "$97.50". Whole dollars drop the cents. */
export function money(amount: number): string {
  const formatted = MONEY.format(amount);
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

/** "Sep 16" — a day inside a list, where the weekday adds nothing. */
function shortDay(key: DayKey): string {
  return formatDay(key).split(', ')[1];
}

/** The estimate only counts in a headline when it covers every install. */
function fullEstimate(digest: RepDigest): number | null {
  const { total } = digest;
  return total.estAmount !== null && total.estCount === total.count ? total.estAmount : null;
}

export function weeklyInstallsSubject(digest: RepDigest): string {
  const { total, upcoming, needsDate, needsDateMore, cancelled } = digest;
  if (total.count > 0) {
    const est = fullEstimate(digest);
    return `Your installs last week: ${total.count} installed${est !== null ? ` · est. ${money(est)}` : ''}`;
  }
  const undated = needsDate.length + needsDateMore;
  const next = upcoming.length
    ? `${upcoming.length} coming up this week`
    : undated
      ? `${plural(undated, 'sale')} ${undated === 1 ? 'needs' : 'need'} a date`
      : `${cancelled.length} cancelled by the carrier`;
  return `Your installs last week: none yet · ${next}`;
}

function preheader(digest: RepDigest): string {
  const parts: string[] = [];
  const { total } = digest;
  if (total.count) {
    parts.push(`${total.count} installed`);
    if (total.estAmount !== null) parts.push(`est. ${money(total.estAmount)}`);
  }
  if (digest.upcoming.length) parts.push(`${digest.upcoming.length} coming up`);
  const undated = digest.needsDate.length + digest.needsDateMore;
  if (undated) parts.push(`${undated} need${undated === 1 ? 's' : ''} a date`);
  return parts.join(' · ');
}

// ----------------------------------------------------------------- html parts

interface Row {
  title: string;
  lines: string[];
  right?: string;
  rightSub?: string;
  /** A short lime-green note after the last line ("Confirmed by carrier"). */
  accent?: string;
  /** A status rather than money: set lighter than an amount. */
  rightIsStatus?: boolean;
}

function rowHtml(row: Row, last: boolean): string {
  const border = last ? '' : `border-bottom:1px solid ${RULE};`;
  const lines = row.lines
    .map(
      (line) =>
        `<div style="font-size:13px;line-height:19px;color:${INK_2};margin-top:2px">${escapeHtml(line)}</div>`
    )
    .join('');
  const accent = row.accent
    ? `<div style="font-size:12px;line-height:18px;font-weight:600;color:#3f7a12;margin-top:3px">${escapeHtml(row.accent)}</div>`
    : '';
  const right = row.right || row.rightSub
    ? `<td valign="top" align="right" style="padding:14px 0 14px 12px;${border}white-space:nowrap;width:1%">${
        row.right
          ? `<div style="font-size:${row.rightIsStatus ? '13px' : '15px'};line-height:21px;font-weight:${row.rightIsStatus ? 600 : 700};color:${NAVY}">${escapeHtml(row.right)}</div>`
          : ''
      }${
        row.rightSub
          ? `<div style="font-size:12px;line-height:18px;color:${INK_3};margin-top:2px">${escapeHtml(row.rightSub)}</div>`
          : ''
      }</td>`
    : '';
  return `<tr>
<td valign="top" style="padding:14px 0;${border}">
<div style="font-size:15px;line-height:21px;font-weight:600;color:${NAVY}">${escapeHtml(row.title)}</div>${lines}${accent}
</td>${right}
</tr>`;
}

function sectionHtml(
  title: string,
  note: string | null,
  rows: Row[],
  footer?: string,
  count: number = rows.length
): string {
  if (!rows.length) return '';
  return `<tr><td style="padding:28px 32px 0 32px" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 6px 0;border-bottom:2px solid ${NAVY}">
<span style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${NAVY}">${escapeHtml(title)}</span>
<span style="font-size:12px;line-height:16px;font-weight:700;color:${INK_3}">&nbsp;&nbsp;${count}</span>
</td></tr>
${note ? `<tr><td style="padding:10px 0 0 0;font-size:13px;line-height:19px;color:${INK_2}">${escapeHtml(note)}</td></tr>` : ''}
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.map((row, index) => rowHtml(row, index === rows.length - 1)).join('\n')}
</table></td></tr>
${footer ? `<tr><td style="padding:2px 0 0 0;font-size:13px;line-height:19px;color:${INK_3}">${escapeHtml(footer)}</td></tr>` : ''}
</table>
</td></tr>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${LIME}" style="border-radius:6px;background:${LIME}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;line-height:18px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:6px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

// ------------------------------------------------------------------- sections

function installRows(digest: RepDigest): Row[] {
  return digest.installed.map((install) => ({
    title: install.customer,
    lines: [
      `${install.address} · ${install.plan}`,
      `Installed ${formatDay(install.installDay)}`,
      `Est. payout ${install.payoutWindow}`,
    ],
    accent: install.carrierConfirmed ? 'Confirmed by the carrier' : undefined,
    right: install.estPay !== null ? `est. ${money(install.estPay)}` : undefined,
  }));
}

function upcomingRows(digest: RepDigest): Row[] {
  return digest.upcoming.map((sale) => ({
    title: sale.customer,
    lines: [`${sale.address} · ${sale.plan}`],
    right: formatDay(sale.installDay),
    rightIsStatus: true,
  }));
}

function cancelRows(digest: RepDigest): Row[] {
  return digest.cancelled.map((order) => ({
    title: order.customer ?? order.address,
    lines: [[order.customer ? order.address : null, order.plan].filter(Boolean).join(' · ')].filter(Boolean),
    right: `${order.kind === 'churned' ? 'Disconnected' : 'Cancelled'} ${shortDay(order.cancelledDay)}`,
    rightIsStatus: true,
  }));
}

function needsDateRows(digest: RepDigest): Row[] {
  return digest.needsDate.map((sale) => ({
    title: sale.customer,
    lines: [`${sale.address} · ${sale.plan}`],
    right: sale.missed ? 'Missed install' : 'No date',
    rightIsStatus: true,
    rightSub: sale.soldDay ? `Sold ${shortDay(sale.soldDay)}` : undefined,
  }));
}

function summaryHtml(digest: RepDigest): string {
  const { total } = digest;
  const range = formatRange(digest.week.last);
  if (total.count === 0) {
    return `<div style="font-size:22px;line-height:28px;font-weight:700;color:${NAVY}">No installs landed last week.</div>
<div style="font-size:14px;line-height:20px;color:${INK_2};margin-top:6px">${escapeHtml(range)}. Here's what's still in motion.</div>`;
  }
  const headline =
    total.estAmount !== null
      ? `est. ${money(total.estAmount)}`
      : plural(total.count, 'install');
  const sub =
    total.estAmount !== null
      ? total.estCount === total.count
        ? `from ${plural(total.count, 'install')} · ${range}`
        : `from ${total.estCount} of ${plural(total.count, 'install')} · ${range}`
      : `installed ${range}`;
  const missing = total.count - total.estCount;
  const gap =
    total.estAmount !== null && missing > 0
      ? `<div style="font-size:12px;line-height:18px;color:${INK_3};margin-top:6px">${escapeHtml(
          `${plural(missing, 'install')} ${missing === 1 ? 'has' : 'have'} no rate on file yet, so ${missing === 1 ? "it isn't" : "they aren't"} in the estimate.`
        )}</div>`
      : '';
  return `<div style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${INK_3}">Last week's installs</div>
<div style="font-size:36px;line-height:42px;font-weight:800;color:${NAVY};margin-top:6px;letter-spacing:-0.01em">${escapeHtml(headline)}</div>
<div style="font-size:14px;line-height:20px;color:${INK_2};margin-top:2px">${escapeHtml(sub)}</div>${gap}`;
}

function intro(digest: RepDigest): string {
  const name = firstName(digest.rep.name);
  if (digest.total.count >= 3) return `Morning, ${name}. Good week. Here's what went in and what's next.`;
  if (digest.total.count > 0) return `Morning, ${name}. Here's what went in last week and what's next.`;
  return `Morning, ${name}. Quick look at your pipeline for the week.`;
}

// --------------------------------------------------------------------- render

export function renderWeeklyInstallsEmail(digest: RepDigest, options: RenderOptions): WeeklyInstallsEmail {
  const base = options.baseUrl.replace(/\/+$/, '');
  const salesUrl = `${base}${SALES_PATH}`;
  const disputeUrl = `${base}${DISPUTE_PATH}`;
  const subject = weeklyInstallsSubject(digest);

  const sections = [
    sectionHtml('Installed last week', null, installRows(digest)),
    sectionHtml('Coming up this week', 'Confirm with the customer the day before.', upcomingRows(digest)),
    sectionHtml(
      'Cancelled by the carrier',
      'Worth a call. Some of these are a scheduling mix-up you can still save.',
      cancelRows(digest)
    ),
    sectionHtml(
      'Needs a date',
      'No date, no install, no pay. Get these on the calendar.',
      needsDateRows(digest),
      digest.needsDateMore ? `+${digest.needsDateMore} more in the portal.` : undefined,
      digest.needsDate.length + digest.needsDateMore
    ),
  ].join('\n');

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; }
  a { color:${NAVY}; }
  @media (max-width:480px) {
    .px { padding-left:20px !important; padding-right:20px !important; }
    .outer { padding:0 !important; }
    .card { border-radius:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};color:${NAVY};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE}">${escapeHtml(preheader(digest))}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}">
<tr><td align="center" class="outer" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" bgcolor="#ffffff" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td height="5" bgcolor="${LIME}" style="height:5px;line-height:5px;font-size:0;background:${LIME}">&nbsp;</td></tr>
<tr><td class="px" style="padding:22px 32px 0 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:13px;line-height:18px;font-weight:800;letter-spacing:0.14em;color:${NAVY}">3C WORLD GROUP</td>
<td align="right" style="font-size:13px;line-height:18px;color:${INK_3};white-space:nowrap">Week of ${escapeHtml(formatRange(digest.week.last))}</td>
</tr></table>
</td></tr>
<tr><td class="px" style="padding:22px 32px 0 32px;font-size:15px;line-height:22px;color:${NAVY}">${escapeHtml(intro(digest))}</td></tr>
<tr><td class="px" style="padding:18px 32px 0 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${LIME_WASH}" style="background:${LIME_WASH};border:1px solid #dcebc6;border-radius:8px;padding:18px 20px">
${summaryHtml(digest)}
</td></tr></table>
</td></tr>
${sections}
<tr><td class="px" style="padding:30px 32px 0 32px">
${button(salesUrl, 'Open my sales')}
<div style="font-size:14px;line-height:20px;color:${INK_2};margin-top:14px">Missing an install? <a href="${escapeHtml(disputeUrl)}" style="color:${NAVY};font-weight:600;text-decoration:underline">Tell us here</a>.</div>
</td></tr>
<tr><td class="px" style="padding:28px 32px 28px 32px">
<div style="border-top:1px solid ${RULE};padding-top:16px;font-size:12px;line-height:18px;color:${INK_3}">${escapeHtml(DISCLAIMER)}</div>
<div style="font-size:12px;line-height:18px;color:${INK_3};margin-top:8px">T-Fiber only for now. You get this on Mondays when you have installs or open sales.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text: renderText(digest, { salesUrl, disputeUrl }) };
}

function renderText(
  digest: RepDigest,
  links: { salesUrl: string; disputeUrl: string }
): string {
  const out: string[] = [];
  const { total } = digest;
  const range = formatRange(digest.week.last);

  out.push(intro(digest), '');
  if (total.count === 0) {
    out.push(`No installs landed last week (${range}).`);
  } else if (total.estAmount !== null) {
    const of = total.estCount === total.count ? '' : `${total.estCount} of `;
    out.push(`LAST WEEK: est. ${money(total.estAmount)} from ${of}${plural(total.count, 'install')} (${range})`);
  } else {
    out.push(`LAST WEEK: ${plural(total.count, 'install')} (${range})`);
  }

  const section = (title: string, lines: string[], note?: string, count = lines.length) => {
    if (!lines.length) return;
    out.push('', `${title.toUpperCase()} (${count})`);
    if (note) out.push(note);
    out.push(...lines);
  };

  section(
    'Installed last week',
    digest.installed.map((install) =>
      [
        `- ${install.customer}, ${install.address}, ${install.plan}\n  Installed ${formatDay(install.installDay)}`,
        install.estPay !== null ? ` · est. ${money(install.estPay)}` : '',
        ` · Est. payout ${install.payoutWindow}`,
      ].join('')
    )
  );
  section(
    'Coming up this week',
    digest.upcoming.map((sale) => `- ${sale.customer}, ${sale.address}, ${sale.plan}. ${formatDay(sale.installDay)}.`)
  );
  section(
    'Cancelled by the carrier',
    digest.cancelled.map((order) =>
      [
        `- ${[order.customer, order.address, order.plan].filter(Boolean).join(', ')}.`,
        ` ${order.kind === 'churned' ? 'Disconnected' : 'Cancelled'} ${shortDay(order.cancelledDay)}.`,
      ].join('')
    ),
    'Worth a call. Some of these are a scheduling mix-up you can still save.'
  );
  section(
    'Needs a date',
    [
      ...digest.needsDate.map(
        (sale) =>
          `- ${sale.customer}, ${sale.address}, ${sale.plan}. ${sale.missed ? 'Missed install' : 'No date'}${
            sale.soldDay ? `, sold ${shortDay(sale.soldDay)}` : ''
          }.`
      ),
      ...(digest.needsDateMore ? [`+${digest.needsDateMore} more in the portal.`] : []),
    ],
    'No date, no install, no pay. Get these on the calendar.',
    digest.needsDate.length + digest.needsDateMore
  );

  out.push(
    '',
    `Open my sales: ${links.salesUrl}`,
    `Missing an install? Tell us here: ${links.disputeUrl}`,
    '',
    '--',
    DISCLAIMER,
    'T-Fiber only for now. You get this on Mondays when you have installs or open sales.'
  );
  return `${out.join('\n')}\n`;
}
