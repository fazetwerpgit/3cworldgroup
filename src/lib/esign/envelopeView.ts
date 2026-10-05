import {
  DOCUMENTS,
  FIELD_LABELS,
  isSensitiveFieldKey,
  selectedCheckboxKey,
} from '@/lib/esign/documents';
import type { InhouseEnvelopeRecord } from '@/lib/esign/inhouse';
import type { EsignDocKey } from '@/lib/esign/types';

export interface EnvelopeFieldView {
  key: string;
  type: 'text' | 'checkbox';
  label: string;
  required: boolean;
  sensitive: boolean;
  value: string | boolean;
  prefilled: boolean;
  page: number;
}

export interface EnvelopeView {
  envelopeId: string;
  docKey: EsignDocKey;
  name: string;
  status: 'sent' | 'completed';
  pageCount: number;
  signerName: string;
  signerEmail: string;
  fields: EnvelopeFieldView[];
}

// Values the rep should not have to retype. Sensitive keys are deliberately
// absent: an SSN or an account number is never read back out of Firestore, so
// the rep types it again and it goes straight into the stamped PDF.
export function profilePrefill(data: FirebaseFirestore.DocumentData): Record<string, string> {
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const displayName = text(data.displayName);
  const email = text(data.email);
  const phone = text(data.phone);
  const address = text(data.address);
  const city = text(data.city);
  const state = text(data.state);
  const zip = text(data.zip);

  const prefill: Record<string, string> = {
    agent_name: displayName,
    legal_name: displayName,
    name: displayName,
    email,
    cell_phone: phone,
    street_address: address,
    address,
  };
  if (city && state && zip) prefill.city_state_zip = `${city}, ${state} ${zip}`;
  return prefill;
}

export function fieldViews(
  docKey: EsignDocKey,
  envelopePrefill: Record<string, string>,
  profile: Record<string, string>
): EnvelopeFieldView[] {
  const checkedKey = selectedCheckboxKey(docKey, envelopePrefill);
  return (DOCUMENTS[docKey].extra ?? []).map((field) => {
    const sensitive = isSensitiveFieldKey(field.key);
    const base = {
      key: field.key,
      type: field.type,
      label: FIELD_LABELS[field.key] ?? field.key,
      required: field.required,
      sensitive,
      page: field.page,
    };
    if (field.type === 'checkbox') {
      const checked = field.key === checkedKey;
      return { ...base, value: checked, prefilled: checked };
    }
    const value = sensitive ? '' : profile[field.key] ?? '';
    return { ...base, value, prefilled: value !== '' };
  });
}

/**
 * What a signing screen needs to render one document: its name, page count,
 * and the field list with whatever can be prefilled from the rep's own
 * profile. Shared by the portal envelope route and the invite sign-all step.
 * Returns null when the envelope's document key is unknown.
 */
export function buildEnvelopeView(
  envelopeId: string,
  envelope: InhouseEnvelopeRecord,
  userData: FirebaseFirestore.DocumentData
): EnvelopeView | null {
  const config = DOCUMENTS[envelope.docKey];
  if (!config) return null;
  return {
    envelopeId,
    docKey: envelope.docKey,
    name: config.name,
    status: envelope.status,
    pageCount: config.pages,
    signerName: envelope.signerName,
    signerEmail: envelope.signerEmail,
    fields: fieldViews(envelope.docKey, envelope.prefill, profilePrefill(userData)),
  };
}
