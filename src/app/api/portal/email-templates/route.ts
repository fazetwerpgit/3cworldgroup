import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { EmailTemplateCategory, resolveRoles } from '@/types';

const VALID_CATEGORIES: EmailTemplateCategory[] = [
  'recruiting',
  'onboarding',
  'performance',
  'general',
];

async function isManagement(userId: string): Promise<boolean> {
  const doc = await adminDb!.collection('users').doc(userId).get();
  if (!doc.exists) return false;
  const { role } = resolveRoles(doc.data()?.role, doc.data()?.fieldRole);
  return role === 'admin' || role === 'operations';
}

// GET /api/portal/email-templates?userId=xxx - Management-only template
// library. Templates are copy-paste material for management's own email
// client; the app stores and organizes them, it does not send email.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!(await isManagement(userId))) {
      return NextResponse.json(
        { error: 'Only management can access email templates' },
        { status: 403 }
      );
    }

    const snapshot = await adminDb.collection('emailTemplates').get();
    const templates = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name,
          category: (d.category ?? 'general') as EmailTemplateCategory,
          subject: d.subject ?? '',
          body: d.body ?? '',
          createdByName: d.createdByName ?? '',
          updatedAt: d.updatedAt?.toDate() ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email templates' },
      { status: 500 }
    );
  }
}

// POST /api/portal/email-templates - Create or update a template. The boss
// supplies the real copy; these are placeholders management can refine.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, name, category, subject, body: templateBody, createdBy, createdByName } = body;

    if (!name || !subject || !templateBody || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: name, subject, body, createdBy' },
        { status: 400 }
      );
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!(await isManagement(createdBy))) {
      return NextResponse.json(
        { error: 'Only management can edit email templates' },
        { status: 403 }
      );
    }

    const now = new Date();
    const payload = {
      name: String(name).trim().slice(0, 200),
      category: category ?? 'general',
      subject: String(subject).trim().slice(0, 300),
      body: String(templateBody).trim().slice(0, 10000),
      updatedAt: now,
    };

    if (id) {
      const existing = await adminDb.collection('emailTemplates').doc(id).get();
      if (!existing.exists) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      await existing.ref.update(payload);
      return NextResponse.json({ success: true, id });
    }

    const docRef = await adminDb.collection('emailTemplates').add({
      ...payload,
      createdBy,
      createdByName: createdByName || '',
      createdAt: now,
    });
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Error saving email template:', error);
    return NextResponse.json(
      { error: 'Failed to save email template' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/email-templates - Remove a template.
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { templateId, requestedBy } = body;
    if (!templateId || !requestedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, requestedBy' },
        { status: 400 }
      );
    }
    if (!(await isManagement(requestedBy))) {
      return NextResponse.json(
        { error: 'Only management can edit email templates' },
        { status: 403 }
      );
    }

    const doc = await adminDb.collection('emailTemplates').doc(templateId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await doc.ref.delete();
    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    return NextResponse.json(
      { error: 'Failed to delete email template' },
      { status: 500 }
    );
  }
}
