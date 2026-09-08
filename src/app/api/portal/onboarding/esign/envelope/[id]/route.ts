import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import {
  DOCUMENTS,
  FIELD_LABELS,
  isSensitiveFieldKey,
  selectedCheckboxKey,
} from '@/lib/esign/documents';
import { loadEnvelope } from '@/lib/esign/inhouse';
import type { EsignDocKey } from '@/lib/esign/provider';

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
function profilePrefill(data: FirebaseFirestore.DocumentData): Record<string, string> {
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

function fieldViews(
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

// GET /api/portal/onboarding/esign/envelope/{id} — what the in-app sign page needs
// to render one document: its name, page count, and the field list with whatever
// we can prefill from the rep's own profile.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await ctx.params;
  const envelope = await loadEnvelope(id);
  if (!envelope) return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
  if (envelope.userId !== gate.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const config = DOCUMENTS[envelope.docKey];
  if (!config) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  const userSnap = await adminDb.collection('users').doc(gate.uid).get();
  const profile = profilePrefill(userSnap.data() ?? {});

  const view: EnvelopeView = {
    envelopeId: id,
    docKey: envelope.docKey,
    name: config.name,
    status: envelope.status,
    pageCount: config.pages,
    signerName: envelope.signerName,
    signerEmail: envelope.signerEmail,
    fields: fieldViews(envelope.docKey, envelope.prefill, profile),
  };
  return NextResponse.json(view);
}
