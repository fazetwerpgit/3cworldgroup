import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createAlertTask } from '@/lib/alerts/alertTasks';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

// The embedded SignWell script reports failure client-side (network blocked,
// CSP, ad blocker, etc.) with no server-side signal of its own. This route is
// how that client-only failure becomes a management-visible alert so someone
// can send the rep a fallback (hosted) signing link instead of them being
// silently stuck.
export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { itemId } = (await request.json().catch(() => ({}))) as { itemId?: string };
  const item = ONBOARDING_ITEMS.find((i) => i.id === itemId);
  if (!item) return NextResponse.json({ error: 'unknown item' }, { status: 400 });

  await createAlertTask({
    kind: 'review_needed',
    subjectUserId: gate.uid,
    subjectName: gate.name,
    title: 'In-portal signing failed to load',
    message: `${gate.name} could not open the signing window for ${item.label}. The signing link may be stale.`,
    link: '/portal/admin/onboarding',
  });

  return NextResponse.json({ ok: true });
}
