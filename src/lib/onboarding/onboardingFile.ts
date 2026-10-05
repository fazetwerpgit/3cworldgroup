import { formatInstallDay } from '@/lib/sales/saleDate';
import { hasSignedPdf } from '@/lib/onboarding/signedPdf';
import {
  getOnboardingItemsForUser,
  ONBOARDING_ITEMS,
  RoleDisplayNames,
  resolveRoles,
  type FieldRole,
  type OnboardingCategory,
  type OnboardingStatus,
} from '@/types';
import { isHeldOnboardingItem } from '@/types/onboardingHold';

// The owner's onboarding file for ONE person: their profile, every onboarding
// item with its status, and what can be opened or downloaded. Shared by the
// owner-only onboarding-file routes (summary, open, zip). Nothing here decrypts:
// SSN / DL# stay with the sensitive route and the export row builder.

type Data = Record<string, unknown>;

/** Firebase uids: the same shape the onboarding files route accepts. */
export const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

export interface OnboardingFileItem {
  itemId: string;
  label: string;
  category: OnboardingCategory;
  sensitive: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  status: OnboardingStatus;
  onHold: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  /** E-sign item with a completed PDF to open. */
  hasSignedPdf: boolean;
  /** Storage item with an upload folder on file. */
  hasFiles: boolean;
  /** Vendor or manual reference text (never a raw number; see looksLikeRawSensitiveData). */
  reference: string | null;
  /** Packet answers kept on the item (W-9 tax classification, deposit account type). */
  prefill: Record<string, string>;
}

export interface OnboardingFileProfile {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  shirtSize: string;
  role: string;
  status: string;
  isIBO: boolean;
  manager: string;
  hireDate: string;
  createdAt: string;
  packetSubmittedAt: string;
  backgroundConsent: 'Yes' | 'No' | '';
}

export interface OnboardingFileSummary {
  uid: string;
  profile: OnboardingFileProfile;
  items: OnboardingFileItem[];
}

export interface OnboardingFileSource {
  uid: string;
  user: Data;
  /** userOnboarding docs by itemId (only the ones that exist). */
  itemDocs: Map<string, Data>;
  sensitive: Data;
  managerName: string;
  packetSubmittedAt: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function day(value: unknown): string | null {
  return formatInstallDay(value);
}

type Db = FirebaseFirestore.Firestore;

/** Reads everything the file shows for one person. null when the user doc does not exist. */
export async function loadOnboardingFileSource(db: Db, uid: string): Promise<OnboardingFileSource | null> {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return null;
  const user = (userSnap.data() ?? {}) as Data;

  const [itemSnaps, sensitiveSnap] = await Promise.all([
    db.getAll(...ONBOARDING_ITEMS.map((item) => db.collection('userOnboarding').doc(`${uid}_${item.id}`))),
    db.collection('userSensitive').doc(uid).get(),
  ]);
  const itemDocs = new Map<string, Data>();
  itemSnaps.forEach((snap, index) => {
    if (snap.exists) itemDocs.set(ONBOARDING_ITEMS[index].id, (snap.data() ?? {}) as Data);
  });

  const managerId = text(user.reportsToId) || text(user.managerId);
  const inviteId = text(user.onboardingInviteId);
  const [managerSnap, packetSnap] = await Promise.all([
    managerId ? db.collection('users').doc(managerId).get() : null,
    inviteId ? db.collection('candidateOnboarding').doc(inviteId).get() : null,
  ]);

  return {
    uid,
    user,
    itemDocs,
    sensitive: sensitiveSnap.exists ? ((sensitiveSnap.data() ?? {}) as Data) : {},
    managerName: managerSnap?.exists ? text(managerSnap.get('displayName')) || text(managerSnap.get('email')) : '',
    packetSubmittedAt: packetSnap?.exists ? packetSnap.get('submittedAt') : null,
  };
}

/**
 * Every item on the person's checklist, plus any item they have a record for
 * (a held item, or one from an earlier role). Older reps with no onboarding get
 * an empty list.
 */
export function buildOnboardingFileItems(source: OnboardingFileSource): OnboardingFileItem[] {
  const { fieldRole } = resolveRoles(source.user.role as never, source.user.fieldRole as never);
  const onChecklist = new Set(
    fieldRole
      ? getOnboardingItemsForUser(fieldRole as FieldRole, source.user.isIBO === true).map((item) => item.id)
      : [],
  );
  return ONBOARDING_ITEMS.filter((item) => onChecklist.has(item.id) || source.itemDocs.has(item.id))
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const doc = source.itemDocs.get(item.id);
      const status = (['not_started', 'submitted', 'approved', 'rejected'] as const).includes(
        doc?.status as OnboardingStatus,
      )
        ? (doc?.status as OnboardingStatus)
        : 'not_started';
      const prefill: Record<string, string> = {};
      if (doc?.prefill && typeof doc.prefill === 'object') {
        for (const [key, value] of Object.entries(doc.prefill as Data)) {
          if (typeof value === 'string' && value) prefill[key] = value;
        }
      }
      const reference = text(doc?.reference);
      return {
        itemId: item.id,
        label: item.label,
        category: item.category,
        sensitive: item.sensitive,
        referenceKind: item.referenceKind,
        status,
        onHold: isHeldOnboardingItem(item.id) && status !== 'approved',
        submittedAt: day(doc?.submittedAt),
        reviewedAt: day(doc?.reviewedAt),
        reviewerName: text(doc?.reviewerName) || null,
        hasSignedPdf: item.referenceKind === 'esign' && hasSignedPdf(doc),
        hasFiles: item.referenceKind === 'storage' && reference !== '',
        reference: item.referenceKind === 'vendor' || item.referenceKind === 'manual' ? reference || null : null,
        prefill,
      };
    });
}

export function buildOnboardingFileSummary(source: OnboardingFileSource): OnboardingFileSummary {
  const user = source.user;
  const { role, fieldRole } = resolveRoles(user.role as never, user.fieldRole as never);
  const effective = role ?? fieldRole;
  const consent = source.sensitive.backgroundCheckAuth;
  return {
    uid: source.uid,
    profile: {
      name: text(user.displayName),
      email: text(user.email),
      phone: text(user.phone),
      address: text(user.address),
      city: text(user.city),
      state: text(user.state),
      zip: text(user.zip),
      shirtSize: text(user.shirtSize),
      role: effective ? (RoleDisplayNames[effective] ?? '') : '',
      status: text(user.status) || 'active',
      isIBO: user.isIBO === true,
      manager: source.managerName,
      hireDate: day(user.hireDate) ?? '',
      createdAt: day(user.createdAt) ?? '',
      packetSubmittedAt: day(source.packetSubmittedAt) ?? '',
      backgroundConsent: consent === true ? 'Yes' : consent === false ? 'No' : '',
    },
    items: buildOnboardingFileItems(source),
  };
}

// ---------- download names ----------

const ITEM_FILE_NAMES: Record<string, string> = {
  w9: 'W9',
  fcra_auth: 'FCRA-authorization',
  background_check: 'Background-check',
  dl_photos: 'Drivers-license',
  contract: 'Contract',
  direct_deposit: 'Direct-deposit',
  pay_structure: 'Compensation',
  onboarding_submission: 'Onboarding-submission',
  llc_sos: 'LLC-SOS',
  insurance: 'Insurance',
  chargeback_card: 'Chargeback-card',
};

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Alex Rivera" -> "Rivera-Alex"; "Mary Ann de la Cruz" -> "Cruz-Mary-Ann-de-la". Falls back to "Employee". */
export function personFilePrefix(displayName: string): string {
  const words = displayName.trim().split(/\s+/).map(slug).filter(Boolean);
  if (words.length === 0) return 'Employee';
  if (words.length === 1) return words[0];
  const last = words[words.length - 1];
  return [last, ...words.slice(0, -1)].join('-');
}

export function itemFileName(itemId: string): string {
  return ITEM_FILE_NAMES[itemId] ?? (slug(itemId) || 'File');
}

/** "Rivera-Alex-W9-signed.pdf" */
export function signedPdfFileName(prefix: string, itemId: string): string {
  return `${prefix}-${itemFileName(itemId)}-signed.pdf`;
}

/**
 * An uploaded file, named for the item: "front.jpg" in dl_photos becomes
 * "Rivera-Alex-Drivers-license-front.jpg"; the single "file.pdf" of an item
 * becomes "Rivera-Alex-Insurance.pdf".
 */
export function uploadFileName(prefix: string, itemId: string, storedName: string): string {
  const dot = storedName.lastIndexOf('.');
  const base = dot > 0 ? storedName.slice(0, dot) : storedName;
  const ext = dot > 0 ? slug(storedName.slice(dot + 1)).toLowerCase() : '';
  const baseSlug = slug(base);
  const name =
    baseSlug && baseSlug !== 'file'
      ? `${prefix}-${itemFileName(itemId)}-${baseSlug}`
      : `${prefix}-${itemFileName(itemId)}`;
  return ext ? `${name}.${ext}` : name;
}

/** Makes every name in a zip unique by adding -2, -3 ... before the extension. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
