import { NextRequest, NextResponse } from 'next/server';
import { claimAlertTask } from '@/lib/alerts/alertTasks';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

export async function POST(request: NextRequest) {
  try {
    // The claimer is stamped onto the task, so identity comes from the verified
    // token — never from the request body.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = (await request.json()) as { taskId?: string };
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }

    const result = await claimAlertTask(taskId, gate.uid, gate.name);
    if (result === 'not_found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (result === 'already_claimed') {
      return NextResponse.json({ error: 'already claimed' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error claiming alert task:', error);
    return NextResponse.json(
      { error: 'Failed to claim alert task' },
      { status: 500 }
    );
  }
}
