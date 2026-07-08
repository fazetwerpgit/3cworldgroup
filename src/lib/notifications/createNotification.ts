import { adminDb } from '@/lib/firebase/admin';
import type { NotificationType } from '@/types/notifications';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<string> {
  if (!adminDb) {
    throw new Error('Database not configured');
  }

  const ref = await adminDb.collection('notifications').add({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    ...(input.link ? { link: input.link } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    read: false,
    createdAt: new Date(),
  });
  return ref.id;
}

export async function createNotificationForMany(
  userIds: string[],
  data: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification({ ...data, userId })));
}
