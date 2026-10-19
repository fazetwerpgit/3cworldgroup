import { FieldRole } from './auth';
import { OnboardingStatus } from './onboarding';

// What an applicant on /apply says they want to sell (owner request, 2026-10).
export const APPLICATION_INTERESTS = [
  { value: 'fiber', label: 'Fiber' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'tv', label: 'TV' },
  { value: 'security', label: 'Security' },
  { value: 'solar', label: 'Solar' },
  { value: 'business', label: 'Business services' },
] as const;

export type ApplicationInterest = (typeof APPLICATION_INTERESTS)[number]['value'];

/** Where an applicant first came from, sorted server-side from their first-touch data. */
export type ApplicationChannel =
  | 'google'
  | 'indeed'
  | 'bing'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'direct'
  | 'other';

/**
 * How an applicant found the site: the first public page they loaded in that
 * browser session and what sent them there. Cookieless, recorded only with the
 * application. Empty strings where the browser had nothing to give.
 */
export interface ApplicationSource {
  referrerHost: string;
  landingPath: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  channel: ApplicationChannel;
}

export type ApplicationStatus =
  | 'applied'
  | 'contacted'
  | 'invited'
  | 'not_selected'
  | 'converted';

export type OnboardingInviteStatus =
  | 'invited'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'converted';

export interface ApplicationRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  referredBy?: string;
  /** What they want to sell, ticked on /apply. Absent on applications from before the question. */
  interests?: ApplicationInterest[];
  /** Absent on applications from before source tracking. */
  source?: ApplicationSource;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What happened to the invite email. 'sent' / 'failed' come from the send
 * itself; 'delivered' / 'bounced' arrive later from Postmark's webhook.
 * Absent on invites from before this was saved.
 */
export type InviteEmailStatus = 'sent' | 'failed' | 'delivered' | 'bounced';

export interface OnboardingInvite {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateCity?: string;
  intendedFieldRole: FieldRole;
  isIBO: boolean;
  status: OnboardingInviteStatus;
  ownerId: string;
  ownerName: string;
  tokenHash: string;
  /** The raw token, encrypted, so the link can be copied or re-sent later. Absent on older invites. */
  tokenEncrypted?: string;
  applicationId?: string;
  /**
   * True when the email already had an account (Auth login or users doc) when
   * the invite was made. Such an invite never sets a password: the hire signs
   * in with their own. Absent on older invites (the submit checks Auth live).
   */
  accountExistedAtInvite?: boolean;
  convertedUserId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  /** The latest invite email (a resend overwrites these). Absent on older invites. */
  emailStatus?: InviteEmailStatus;
  emailedAt?: Date;
  postmarkMessageId?: string;
  /** A short code ('postmark_422', 'network'), never the address or message. */
  emailError?: string;
  deliveredAt?: Date;
  bouncedAt?: Date;
}

export interface CandidateOnboardingItem {
  itemId: string;
  label: string;
  status: OnboardingStatus;
  reference: string;
}

export interface CandidateOnboardingPacket {
  id: string;
  inviteId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  fieldRole: FieldRole;
  isIBO: boolean;
  convertedUserId?: string;
  items: CandidateOnboardingItem[];
  status: 'submitted' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewerName?: string;
}

export const RecruitingStatusLabels: Record<OnboardingInviteStatus, string> = {
  invited: 'Invited',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  converted: 'Converted',
};
