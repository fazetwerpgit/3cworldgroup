export interface EmailContent {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:24px;background:#f6f7f9">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<h2 style="margin:0 0 16px">${title}</h2>
${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#8a8f98">3C World Group Portal - automated message.</p>
</div></body></html>`;
}

/** Teal from the onboarding department's own hire email. */
const INVITE_TEAL = '#00797c';
const ONBOARDING_ADDRESS = 'onboarding@3cworldgroup.com';

/**
 * The hire email, laid out like the one the onboarding department sends by
 * hand: logo, "Congratulations", the welcome lines signed by the department,
 * and one button to the invite link. Table layout and inline styles only, so
 * Gmail and Outlook render it the same.
 */
export function inviteEmail(p: { inviteUrl: string }): EmailContent {
  const subject = 'Welcome to 3C World Group - start your onboarding';
  const lines = [
    'Welcome to 3C!',
    'Please click on the link below and fill out all details regarding onboarding.',
    'When completed, you will receive a call from one of our onboarding specialists to schedule you in for online training!',
    'We look forward to your upcoming success!',
  ];
  const p16 = 'margin:0 0 12px;font-size:16px;line-height:1.45;color:#1a1a1a';
  const htmlBody = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding-bottom:20px"><img src="${appBaseUrl()}/logo.png" width="180" height="169" alt="3C World Group" style="display:block;border:0;width:180px;height:auto"></td></tr>
<tr><td align="center" style="padding-bottom:20px"><h1 style="margin:0;font-size:40px;line-height:1.15;font-weight:700;color:${INVITE_TEAL}">Congratulations, you&#39;re hired!</h1></td></tr>
<tr><td align="center">
${lines.map((line) => `<p style="${p16}">${line}</p>`).join('\n')}
<p style="${p16};margin-top:20px">Thank you,</p>
<p style="${p16}">Onboarding Department</p>
<p style="${p16}"><a href="mailto:${ONBOARDING_ADDRESS}" style="color:#1155cc">${ONBOARDING_ADDRESS}</a></p>
</td></tr>
<tr><td align="center" style="padding:16px 0 8px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${INVITE_TEAL}" style="border-radius:4px;background:${INVITE_TEAL}"><a href="${p.inviteUrl}" style="display:inline-block;padding:14px 32px;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:4px">Start Onboarding</a></td>
</tr></table>
</td></tr>
<tr><td align="center" style="padding-top:20px;font-size:12px;line-height:1.5;color:#6b7280">
This link is just for you and expires in 14 days. If the button doesn&#39;t work, copy this into your browser:<br>
<a href="${p.inviteUrl}" style="color:#6b7280;word-break:break-all">${p.inviteUrl}</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return {
    subject,
    textBody: `Congratulations, you're hired!\n\n${lines.join('\n')}\n\nStart onboarding: ${p.inviteUrl}\n(This link is just for you and expires in 14 days.)\n\nThank you,\nOnboarding Department\n${ONBOARDING_ADDRESS}\n`,
    htmlBody,
  };
}

export type NudgeTier = 'h24' | 'h72' | 'd7';

const NUDGE_COPY: Record<NudgeTier, { subject: string; line: string }> = {
  h24: { subject: 'Quick nudge: your onboarding is waiting', line: 'You are close - pick up where you left off and knock out the next step.' },
  h72: { subject: 'Still with us? Your onboarding needs you', line: 'Your onboarding has been idle for a few days. Your manager has been looped in and can help if you are stuck.' },
  d7: { subject: 'Final reminder: complete your onboarding', line: 'It has been a week without progress. Finish your remaining steps to keep your spot on the team.' },
};

export function nudgeEmail(p: { name: string; tier: NudgeTier; portalUrl: string }): EmailContent {
  const c = NUDGE_COPY[p.tier];
  return {
    subject: c.subject,
    textBody: `Hi ${p.name},\n\n${c.line}\n\nContinue: ${p.portalUrl}\n`,
    htmlBody: layout(c.subject, `<p>Hi ${p.name},</p><p>${c.line}</p><p><a href="${p.portalUrl}">Continue onboarding</a></p><p>${p.portalUrl}</p>`),
  };
}

export function checklistReadyEmail(p: { name: string; portalUrl: string }): EmailContent {
  const subject = 'Your onboarding checklist is ready';
  const line = 'Your position was assigned. Complete your onboarding checklist to go active.';
  return {
    subject,
    textBody: `Hi ${p.name},\n\n${line}\n\nContinue: ${p.portalUrl}\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>${line}</p><p><a href="${p.portalUrl}">Continue onboarding</a></p><p>${p.portalUrl}</p>`),
  };
}

export function itemRejectedEmail(p: { name: string; itemLabel: string; reason: string; portalUrl: string }): EmailContent {
  const subject = `Action needed: ${p.itemLabel} was returned`;
  return {
    subject,
    textBody: `Hi ${p.name},\n\nYour "${p.itemLabel}" submission was returned: ${p.reason}\n\nFix it here: ${p.portalUrl}\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>Your <strong>${p.itemLabel}</strong> submission was returned:</p><blockquote>${p.reason}</blockquote><p><a href="${p.portalUrl}">Resubmit</a></p>`),
  };
}

export function esignSentEmail(p: { name: string; docLabels: string[]; portalUrl: string }): EmailContent {
  const subject = 'Your documents are ready to sign';
  const list = p.docLabels.join(', ');
  return {
    subject,
    textBody: `Hi ${p.name},\n\nThe following documents are ready for your signature: ${list}.\n\nSign them in the portal: ${p.portalUrl}\n`,
    htmlBody: layout(
      subject,
      `<p>Hi ${p.name},</p><p>The following documents are ready for your signature: <strong>${list}</strong>.</p><p><a href="${p.portalUrl}">Open your onboarding checklist</a> and sign them right there - it only takes a minute.</p>`,
    ),
  };
}

export function activationEmail(p: { name: string }): EmailContent {
  const subject = 'You are officially active - welcome aboard';
  return {
    subject,
    textBody: `Hi ${p.name},\n\nYour onboarding is complete and your account is now active. Welcome to the team!\n\n${appBaseUrl()}/portal\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>Your onboarding is complete and your account is now <strong>active</strong>. Welcome to the team!</p><p><a href="${appBaseUrl()}/portal">Open the portal</a></p>`),
  };
}

export function ownerDocSignedEmail(p: { repName: string; itemLabel: string; link: string }): EmailContent {
  const subject = `${p.repName} signed ${p.itemLabel}`;
  return {
    subject,
    textBody: `${p.repName} signed ${p.itemLabel}.

Review onboarding: ${p.link}
`,
    htmlBody: layout(subject, `<p><strong>${p.repName}</strong> signed <strong>${p.itemLabel}</strong>.</p><p><a href="${p.link}">Review onboarding</a></p>`),
  };
}

export interface OnboardingPacketData {
  repName: string;
  completedOn: string;
  profile: Array<[string, string]>;
  checklist: Array<{ label: string; status: string; submitted: string; reviewed: string }>;
  masked: Array<[string, string]>;
  attached: string[];
  skipped: string[];
  link: string;
}

const PACKET_MUTED = '#8a8f98';
const PACKET_RULE = '#e6e8eb';

// Packet values come from rep-entered profile data, so escape them for HTML.
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function packetHeading(text: string): string {
  return `<h3 style="margin:28px 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${PACKET_MUTED}">${text}</h3>`;
}

function packetNote(text: string): string {
  return `<p style="margin:6px 0 0;font-size:13px;color:${PACKET_MUTED}">${text}</p>`;
}

export function onboardingPacketEmail(p: OnboardingPacketData): EmailContent {
  const subject = `Onboarding packet: ${p.repName}`;
  const cell = `padding:6px 12px 6px 0;font-size:14px;border-bottom:1px solid ${PACKET_RULE}`;
  // The HTML heading already carries the rep name; the text body has to repeat it.
  const attachNote = p.attached.length ? ' Signed documents are attached.' : '';
  const intro = `Onboarding completed ${p.completedOn}.${attachNote}`;
  const textIntro = `${p.repName} completed onboarding ${p.completedOn}.${attachNote}`;

  const profileHtml = p.profile.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:4px">${p.profile
        .map(([label, value]) => `<tr><td style="${cell};color:${PACKET_MUTED};width:120px">${esc(label)}</td><td style="${cell}">${esc(value)}</td></tr>`)
        .join('')}</table>`
    : '';

  const checklistHtml = p.checklist.length
    ? packetHeading('Checklist') + `<table style="width:100%;border-collapse:collapse">
<tr><th style="${cell};text-align:left;color:${PACKET_MUTED};font-weight:600">Item</th><th style="${cell};text-align:left;color:${PACKET_MUTED};font-weight:600">Status</th><th style="${cell};text-align:left;color:${PACKET_MUTED};font-weight:600">Submitted</th><th style="${cell};text-align:left;color:${PACKET_MUTED};font-weight:600">Reviewed</th></tr>
${p.checklist
        .map((row) => `<tr><td style="${cell}">${esc(row.label)}</td><td style="${cell}">${esc(row.status)}</td><td style="${cell}">${esc(row.submitted)}</td><td style="${cell}">${esc(row.reviewed)}</td></tr>`)
        .join('')}</table>`
    : '';

  const documentsHtml = packetHeading('Documents')
    + `<p style="margin:0;font-size:14px">${p.attached.length ? esc(p.attached.join(', ')) : 'No signed PDFs were available to attach.'}</p>`
    + (p.skipped.length ? packetNote(`Not attached: ${esc(p.skipped.join(', '))}`) : '')
    + packetNote('Photo uploads stay in the admin page.');

  const maskedHtml = p.masked.length
    ? packetHeading('Identity (masked)')
      + `<p style="margin:0;font-size:14px">${p.masked.map(([label, value]) => `${esc(label)} ${esc(value)}`).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>`
      + packetNote('Full values: portal → Admin → Users → reveal (audited).')
    : '';

  const textBody = [
    textIntro,
    ...(p.profile.length ? ['', ...p.profile.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(p.checklist.length
      ? ['', 'CHECKLIST', ...p.checklist.map((row) => {
          const dates = [row.submitted !== '—' ? `submitted ${row.submitted}` : '', row.reviewed !== '—' ? `reviewed ${row.reviewed}` : '']
            .filter(Boolean)
            .join(', ');
          return `${row.label}: ${row.status}${dates ? ` (${dates})` : ''}`;
        })]
      : []),
    '',
    'DOCUMENTS',
    p.attached.length ? p.attached.join(', ') : 'No signed PDFs were available to attach.',
    ...(p.skipped.length ? [`Not attached: ${p.skipped.join(', ')}`] : []),
    'Photo uploads stay in the admin page.',
    ...(p.masked.length
      ? ['', 'IDENTITY (MASKED)', ...p.masked.map(([label, value]) => `${label}: ${value}`), 'Full values: portal → Admin → Users → reveal (audited).']
      : []),
    '',
    `Review in the portal: ${p.link}`,
    '',
  ].join('\n');

  return {
    subject,
    textBody,
    htmlBody: layout(
      `Onboarding packet: ${esc(p.repName)}`,
      `<p style="margin:0 0 4px;font-size:14px">${intro}</p>${profileHtml}${checklistHtml}${documentsHtml}${maskedHtml}<p style="margin:28px 0 0"><a href="${p.link}">Review in the portal</a></p>`,
    ),
  };
}

export function managerAlertEmail(p: { title: string; message: string; link: string }): EmailContent {
  return {
    subject: `[Portal] ${p.title}`,
    textBody: `${p.title}\n\n${p.message}\n\n${p.link}\n`,
    htmlBody: layout(p.title, `<p>${p.message}</p><p><a href="${p.link}">Open in portal</a></p>`),
  };
}

export function formSubmissionEmail(p: { formName: string; submittedBy: string; link: string }): EmailContent {
  const subject = `New ${p.formName} submission`;
  const submittedBy = p.submittedBy || 'A team member';
  return {
    subject,
    textBody: `${submittedBy} submitted a ${p.formName}.\n\nReview it here: ${p.link}\n`,
    htmlBody: layout(subject, `<p>${submittedBy} submitted a <strong>${p.formName}</strong>.</p><p><a href="${p.link}">Review submission</a></p>`),
  };
}
