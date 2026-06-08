import { FieldRole } from './auth';

export type OnboardingCategory = 'paperwork' | 'financial' | 'business' | 'credential';
export type OnboardingStatus = 'not_started' | 'submitted' | 'approved' | 'rejected';

export interface OnboardingItem {
  id: string;
  label: string;
  category: OnboardingCategory;
  appliesToRoles: FieldRole[]; // Empty = applies to all field roles
  iboOnly: boolean;
  sensitive: boolean;
  order: number;
}

// Onboarding checklist definitions
export const ONBOARDING_ITEMS: OnboardingItem[] = [
  // Base items - all field roles
  { id: 'w9', label: 'W-9', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: true, order: 1 },
  { id: 'contract', label: 'Contract', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: false, order: 2 },
  { id: 'onboarding_submission', label: 'Onboarding Submission', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: false, order: 3 },
  { id: 'direct_deposit', label: 'Direct Deposit', category: 'financial', appliesToRoles: [], iboOnly: false, sensitive: true, order: 4 },
  { id: 'pay_structure', label: 'Pay Structure', category: 'financial', appliesToRoles: [], iboOnly: false, sensitive: false, order: 5 },
  // IBO-only items
  { id: 'llc_sos', label: 'LLC / Secretary of State', category: 'business', appliesToRoles: [], iboOnly: true, sensitive: false, order: 6 },
  { id: 'insurance', label: 'Insurance', category: 'business', appliesToRoles: [], iboOnly: true, sensitive: false, order: 7 },
  { id: 'chargeback_card', label: 'Credit Card / Background Check / Drug Screen', category: 'financial', appliesToRoles: [], iboOnly: true, sensitive: true, order: 8 },
];

// Per-user progress on an onboarding item
export interface UserOnboardingItem {
  id?: string;
  userId: string;
  itemId: string;
  status: OnboardingStatus;
  // Sensitive items store a reference only (storage path OR vendor ref) -
  // no card numbers or SSNs are ever persisted.
  reference?: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  submittedAt?: Date;
  updatedAt: Date;
}

// UI display config per onboarding status
export const OnboardingStatusConfig: Record<OnboardingStatus, { name: string; color: string }> = {
  not_started: { name: 'Not Started', color: 'gray' },
  submitted: { name: 'Under Review', color: 'yellow' },
  approved: { name: 'Approved', color: 'green' },
  rejected: { name: 'Needs Attention', color: 'red' },
};

export const OnboardingCategoryLabels: Record<OnboardingCategory, string> = {
  paperwork: 'Paperwork',
  financial: 'Financial',
  business: 'Business (IBO)',
  credential: 'Credentialing',
};

export type ChannelOnboardingStatus = 'not_started' | 'submitted' | 'cleared';

// Per-user credentialing progress for a sales channel
export interface UserChannelOnboarding {
  id?: string;
  userId: string;
  channelId: string;
  status: ChannelOnboardingStatus;
  reference?: string;
  submittedAt?: Date;
  clearedAt?: Date;
  updatedAt: Date;
}

// Guardrail for sensitive items: the app stores a reference/vendor token only,
// never raw SSNs, bank-account, or card numbers. This rejects the obvious
// raw-PII shapes (a bare 9-digit SSN, or a 13-19 digit card/account run, with
// or without separators) so a user can't paste raw data into a reference field.
// It is a guardrail, not full DLP.
export function looksLikeRawSensitiveData(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  // SSN = 9 digits; card/bank = 13-19 digits
  return digits.length === 9 || (digits.length >= 13 && digits.length <= 19);
}

// Helper to get the onboarding checklist for a user
export function getOnboardingItemsForUser(fieldRole: FieldRole, isIBO: boolean): OnboardingItem[] {
  return ONBOARDING_ITEMS
    .filter(
      (item) =>
        (item.appliesToRoles.length === 0 || item.appliesToRoles.includes(fieldRole)) &&
        (item.iboOnly === false || isIBO === true)
    )
    .sort((a, b) => a.order - b.order);
}
