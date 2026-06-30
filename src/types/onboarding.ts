import { FieldRole } from './auth';

export type OnboardingCategory = 'paperwork' | 'financial' | 'business' | 'credential';
export type OnboardingStatus = 'not_started' | 'submitted' | 'approved' | 'rejected';

// How the reference value for an item is obtained. The app NEVER stores the
// raw document/number - only this kind of pointer:
//   vendor  - a token/ref from an external vendor (e.g. background-check provider)
//   storage - a Firebase Storage path to an uploaded file (e.g. DL photos)
//   esign   - a reference to a signed agreement (e.g. Adobe Sign agreement id)
//   manual  - free-text confirmation reference entered by staff
export type ReferenceKind = 'vendor' | 'storage' | 'esign' | 'manual';

export interface OnboardingItem {
  id: string;
  label: string;
  category: OnboardingCategory;
  appliesToRoles: FieldRole[]; // Empty = applies to all field roles
  iboOnly: boolean;
  sensitive: boolean;
  referenceKind: ReferenceKind;
  signatureProvider?: 'adobe_sign'; // Set when the item is completed via e-signature
  order: number;
}

// Onboarding checklist definitions
export const ONBOARDING_ITEMS: OnboardingItem[] = [
  // Base items - all field roles
  { id: 'w9', label: 'W-9', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: true, referenceKind: 'storage', order: 1 },
  // Background / drug screen carries DL# + SSN through the vendor - stored as a
  // vendor reference only, never the raw numbers.
  { id: 'background_check', label: 'Background / Drug Screen Authorization', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: true, referenceKind: 'vendor', order: 2 },
  { id: 'dl_photos', label: "Driver's License Photos (Front & Back)", category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: true, referenceKind: 'storage', order: 3 },
  { id: 'contract', label: 'Contract', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: false, referenceKind: 'esign', signatureProvider: 'adobe_sign', order: 4 },
  { id: 'direct_deposit', label: 'Direct Deposit', category: 'financial', appliesToRoles: [], iboOnly: false, sensitive: true, referenceKind: 'esign', signatureProvider: 'adobe_sign', order: 5 },
  { id: 'pay_structure', label: 'Compensation', category: 'financial', appliesToRoles: [], iboOnly: false, sensitive: false, referenceKind: 'esign', signatureProvider: 'adobe_sign', order: 6 },
  { id: 'onboarding_submission', label: 'Onboarding Submission', category: 'paperwork', appliesToRoles: [], iboOnly: false, sensitive: false, referenceKind: 'manual', order: 7 },
  // IBO-only items (the IBO owner holds these; IBO Reps under an owner skip them)
  { id: 'llc_sos', label: 'LLC / Secretary of State', category: 'business', appliesToRoles: [], iboOnly: true, sensitive: false, referenceKind: 'storage', order: 8 },
  { id: 'insurance', label: 'Proof of Insurance', category: 'business', appliesToRoles: [], iboOnly: true, sensitive: false, referenceKind: 'storage', order: 9 },
  { id: 'chargeback_card', label: 'Chargeback Credit Card', category: 'financial', appliesToRoles: [], iboOnly: true, sensitive: true, referenceKind: 'vendor', order: 10 },
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
