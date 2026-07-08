import { NextRequest, NextResponse } from 'next/server';
import { claimAlertTask } from '@/lib/alerts/alertTasks';
import { requireManagement } from '@/lib/auth/requireManagement';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      requestedBy?: string;
      taskId?: string;
    };
    const { requestedBy, taskId } = body;

    if (!requestedBy || !taskId) {
      return NextResponse.json(
        { error: 'requestedBy and taskId are required' },
        { status: 400 }
      );
    }

    const gate = await requireManagement(requestedBy);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const result = await claimAlertTask(taskId, requestedBy, gate.requester.name);
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
