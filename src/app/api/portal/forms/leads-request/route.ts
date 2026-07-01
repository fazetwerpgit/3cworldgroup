import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { buildFormAttachmentFolder } from '@/lib/forms/formUploads';
import { leadsConditions } from '@/lib/forms/leadsPredicates';
import {
  LEADS_CATEGORIES,
  LEADS_REASONS,
  isValidOption,
} from '@/lib/forms/formOptions';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Accept an uploaded path only if it exactly matches THIS caller's own folder for
// the given slot; otherwise store empty (prevents cross-user/path injection).
function scopedPath(raw: unknown, uid: string, slot: string): string {
  const path = s(raw, 300);
  return path === buildFormAttachmentFolder(uid, 'leads-request', slot) ? path : '';
}

// POST /api/portal/forms/leads-request - a verified rep/manager requests leads.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const opts = await getResolvedFormOptions();
    const campaign = s(body.campaign, 40);
    const managerName = s(body.managerName, 120);
    const managerEmail = s(body.managerEmail, 180);
    const repFirstName = s(body.repFirstName, 120);
    const repLastName = s(body.repLastName, 120);
    const location = s(body.location, 120);
    const category = s(body.category, 120);
    const reason = s(body.reason, 160);

    // Required core fields.
    if (!managerEmail || !repFirstName || !repLastName) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(opts.leadsCampaigns, campaign)) {
      return NextResponse.json({ error: 'Select a valid campaign' }, { status: 400 });
    }
    if (!isValidOption(opts.leadsManagers, managerName)) {
      return NextResponse.json({ error: 'Select a valid manager' }, { status: 400 });
    }
    if (!isValidOption(opts.leadsLocations, location)) {
      return NextResponse.json({ error: 'Select a valid location' }, { status: 400 });
    }
    // Category + reason are optional, but if provided must be valid options.
    if (category && !isValidOption(LEADS_CATEGORIES, category)) {
      return NextResponse.json({ error: 'Select a valid category' }, { status: 400 });
    }
    if (reason && !isValidOption(LEADS_REASONS, reason)) {
      return NextResponse.json({ error: 'Select a valid reason' }, { status: 400 });
    }

    // Re-derive which conditional fields apply; drop anything not triggered.
    const cond = leadsConditions({ category, reason, location });
    const specialRequest = cond.needsSpecialRequest ? s(body.specialRequest, 2000) : '';
    const leadPackCode = cond.needsLeadPackCode ? s(body.leadPackCode, 60) : '';
    const situationDescription =
      cond.needsHostile || cond.needsBlindKnock ? s(body.situationDescription, 2000) : '';
    const newRepPhone = cond.needsNewRep ? s(body.newRepPhone, 40) : '';
    const newRepEmail = cond.needsNewRep ? s(body.newRepEmail, 180) : '';
    const hostileUploadPath = cond.needsHostile ? scopedPath(body.hostileUploadPath, gate.uid, 'hostile') : '';
    const blindKnockUploadPath = cond.needsBlindKnock ? scopedPath(body.blindKnockUploadPath, gate.uid, 'blind-knock') : '';
    const lassoUploadPath = cond.needsLasso ? scopedPath(body.lassoUploadPath, gate.uid, 'lasso') : '';

    const { id } = await submitFormRecord(
      'leadsRequests',
      { uid: gate.uid, name: gate.name, email: gate.email },
      {
        campaign, managerName, managerEmail, repFirstName, repLastName, location,
        category, reason, specialRequest, leadPackCode, situationDescription,
        hostileUploadPath, blindKnockUploadPath, lassoUploadPath, newRepPhone, newRepEmail,
      }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting leads request:', error);
    return NextResponse.json({ error: 'Failed to submit leads request' }, { status: 500 });
  }
}
