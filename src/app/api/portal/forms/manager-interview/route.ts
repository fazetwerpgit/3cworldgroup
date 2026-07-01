import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedFieldManagerOrManagement } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { isValidOption } from '@/lib/forms/formOptions';
import { isPromotionRole, validateSignatureDataUrl, isEmailShaped } from '@/lib/forms/managerInterview';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
// Coerce a truthy Yes/No answer to boolean (used for the optional promotion Qs).
function yn(v: unknown): boolean {
  return v === true || v === 'yes' || v === 'Yes';
}
// Strict Yes/No for REQUIRED decision fields: returns null when the value is
// missing or not an explicit yes/no, so the route can reject it rather than
// silently recording a "No".
function requiredYesNo(v: unknown): boolean | null {
  if (v === true || v === 'yes' || v === 'Yes') return true;
  if (v === false || v === 'no' || v === 'No') return false;
  return null;
}

// POST /api/portal/forms/manager-interview - a manager records a hire decision.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedFieldManagerOrManagement(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const opts = await getResolvedFormOptions();

    const provider = s(body.provider, 60);
    const jobPosition = s(body.jobPosition, 80);
    const hiringManager = s(body.hiringManager, 120);
    const hiringManagerEmail = s(body.hiringManagerEmail, 180);
    const candidateFirstName = s(body.candidateFirstName, 120);
    const candidateLastName = s(body.candidateLastName, 120);
    const candidateEmail = s(body.candidateEmail, 180);
    const market = s(body.market, 120);
    const rating = Number(body.rating);

    if (!hiringManagerEmail || !candidateFirstName || !candidateLastName || !candidateEmail) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isEmailShaped(hiringManagerEmail) || !isEmailShaped(candidateEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    if (!isValidOption(opts.providers, provider)) {
      return NextResponse.json({ error: 'Select a valid provider' }, { status: 400 });
    }
    if (!isValidOption(opts.hireJobPositions, jobPosition)) {
      return NextResponse.json({ error: 'Select a valid job position' }, { status: 400 });
    }
    if (!isValidOption(opts.hireManagers, hiringManager)) {
      return NextResponse.json({ error: 'Select a valid hiring manager' }, { status: 400 });
    }
    // Market is required; must be one of the configured markets. If none are
    // configured yet, this correctly blocks submission until an admin adds them.
    if (!isValidOption(opts.hireMarkets, market)) {
      return NextResponse.json({ error: 'Select a valid market' }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be 1 to 5' }, { status: 400 });
    }
    if (!validateSignatureDataUrl(body.signatureDataUrl)) {
      return NextResponse.json({ error: 'A signature is required' }, { status: 400 });
    }

    // Did-show and extend-offer are required decisions; reject if omitted rather
    // than silently recording "No".
    const didShow = requiredYesNo(body.didShow);
    const extendOffer = requiredYesNo(body.extendOffer);
    if (didShow === null || extendOffer === null) {
      return NextResponse.json({ error: 'Answer Did Candidate Show and Extend Offer' }, { status: 400 });
    }

    // Promotion-only answers apply only for promotion roles; drop otherwise.
    const promo = isPromotionRole(jobPosition);
    const completedProduction = promo ? yn(body.completedProduction) : '';
    const completedReading = promo ? yn(body.completedReading) : '';
    const completedTeamMetric = promo ? yn(body.completedTeamMetric) : '';

    const { id } = await submitFormRecord(
      'managerInterviews',
      { uid: gate.uid, name: gate.name, email: gate.email },
      {
        provider, jobPosition, hiringManager, hiringManagerEmail,
        candidateFirstName, candidateLastName, candidateEmail, market,
        didShow,
        extendOffer,
        rating,
        completedProduction, completedReading, completedTeamMetric,
        signatureDataUrl: body.signatureDataUrl,
      }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting manager interview:', error);
    return NextResponse.json({ error: 'Failed to submit manager interview' }, { status: 500 });
  }
}
