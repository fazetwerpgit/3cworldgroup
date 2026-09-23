import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { buildRepDigest, isDigestEmpty } from '@/lib/weeklyInstalls/digest';
import { gatherRep } from '@/lib/weeklyInstalls/gather';
import { emailBaseUrl, renderWeeklyInstallsEmail } from '@/lib/weeklyInstalls/render';
import { isDayKey, reportWeekFor, reportWeekFromStart } from '@/lib/weeklyInstalls/week';

// GET /api/portal/weekly-installs/preview?repId=<uid>&week=<YYYY-MM-DD>
//
// OWNER ONLY. Renders the Monday email one rep would get for the Sun–Sat week
// containing `week` (default: the most recent completed week). It reads, it
// renders, it returns. It NEVER sends and NEVER writes — no send-log claim, no
// Postmark call — so the owner can look at any rep's email any time.
//
// `format=html` returns the page itself; the default is JSON
// ({ subject, html, text, empty, week }).

export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!gate.isOwner) {
    return NextResponse.json({ error: 'Forbidden: owner access required' }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const repId = (params.get('repId') ?? '').trim();
  if (!repId) {
    return NextResponse.json({ error: 'repId is required' }, { status: 400 });
  }
  const weekParam = params.get('week');
  if (weekParam && !isDayKey(weekParam)) {
    return NextResponse.json({ error: 'week must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const rep = await gatherRep(adminDb, repId);
    if (!rep) {
      return NextResponse.json({ error: 'Rep not found' }, { status: 404 });
    }
    const week = weekParam ? reportWeekFromStart(weekParam) : reportWeekFor(new Date());
    const digest = buildRepDigest({
      rep: { uid: rep.uid, name: rep.name },
      sales: rep.sales,
      orders: rep.orders,
      rates: rep.rates,
      week,
    });
    const email = renderWeeklyInstallsEmail(digest, { baseUrl: emailBaseUrl() });

    if (params.get('format') === 'html') {
      return new NextResponse(email.html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json(
      {
        repId: rep.uid,
        repName: rep.name,
        week: week.last,
        // An empty digest is never sent; the preview still shows what it would say.
        empty: isDigestEmpty(digest),
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error building weekly installs preview:', error);
    return NextResponse.json({ error: 'Failed to build preview' }, { status: 500 });
  }
}
