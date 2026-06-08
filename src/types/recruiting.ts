import { FieldRole } from './auth';
import { OnboardingStatus } from './onboarding';

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
