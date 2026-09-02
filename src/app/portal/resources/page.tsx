'use client';

import { useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import {
  ResourcesLineShell,
  ResourcesLineLaneHead,
  ResourcesLineDoorway,
  ResourcesLineShortsLane,
  ResourcesLineToolList,
  ResourcesLinePayLane,
} from '@/components/resources/ResourcesLine';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/sweep-rep-a.css';

export default function ResourcesHubPage() {
  const { user } = useAuth();
  const { fetchResources, fetchProgress, getOverallProgress } = useTraining();

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  const { completed, total, percentage } = getOverallProgress();

  return (
    <ProtectedRoute>
      <ResourcesLineShell>
        <PageTitle title="Resources" />

        <div className="resources-line-lane-grid">
          <div className="resources-line-lane">
            <ResourcesLineDoorway
              completed={completed}
              total={total}
              percentage={percentage}
            />
            <ResourcesLineShortsLane />
          </div>
          <div className="resources-line-lane">
            <ResourcesLineLaneHead title="Field tools" />
            <ResourcesLineToolList />
            <ResourcesLinePayLane />
          </div>
        </div>
      </ResourcesLineShell>
    </ProtectedRoute>
  );
}
