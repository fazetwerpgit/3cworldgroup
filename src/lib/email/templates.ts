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

export function inviteEmail(p: { candidateName: string; ownerName: string; inviteUrl: string }): EmailContent {
  const subject = 'Welcome to 3C World Group - start your onboarding';
  return {
    subject,
    textBody: `Hi ${p.candidateName},\n\n${p.ownerName} invited you to join the team. Complete your onboarding here: ${p.inviteUrl} (link expires in 14 days).\n`,
    htmlBody: layout(subject, `<p>Hi ${p.candidateName},</p><p>${p.ownerName} invited you to join the team.</p><p><a href="${p.inviteUrl}">Start your onboarding</a> (link expires in 14 days).</p><p>${p.inviteUrl}</p>`),
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

export function esignSentEmail(p: { name: string; docLabels: string[] }): EmailContent {
  const subject = 'Documents sent for your signature';
  const list = p.docLabels.join(', ');
  return {
    subject,
    textBody: `Hi ${p.name},\n\nWe just emailed you the following for e-signature: ${list}. Check your inbox (and spam folder).\n`,
    htmlBody: layout(subject, `<p>Hi ${p.name},</p><p>We just emailed you the following for e-signature: <strong>${list}</strong>.</p><p>Check your inbox (and spam folder).</p>`),
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
