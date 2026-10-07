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
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
  convertedUserId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
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
