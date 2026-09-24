import type { OnboardingItem, OnboardingStatus } from '@/types/onboarding';

/** One checklist item as the rep's onboarding board shows it: the item plus its review state. */
export interface WizardItem extends OnboardingItem {
  status: OnboardingStatus;
  reference: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  esignDispatch?: { state?: string; attempts?: number } | null;
  esignSigningUrl?: string | null;
}
