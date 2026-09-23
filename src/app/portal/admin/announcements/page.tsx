'use client';

import { AdminGate } from '@/components/portal/admin-d/AdminUi';
import { AnnouncementsManager } from '@/components/announcements/AnnouncementsManager';

// Owner only: schedules a push notification to every active user's phone.
export default function AnnouncementsPage() {
  return (
    <AdminGate roles={['owner']}>
      <AnnouncementsManager />
    </AdminGate>
  );
}
