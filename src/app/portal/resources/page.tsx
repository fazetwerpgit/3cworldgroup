'use client';

import { useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  ResourcesLineShell,
  ResourcesLineHero,
  ResourcesLineSummaryStrip,
  ResourcesLineLaneHead,
  ResourcesLineDoorway,
  ResourcesLineShortsLane,
  ResourcesLineToolList,
  ResourcesLinePayLane,
  ResourcesLineFooter,
} from '@/components/resources/ResourcesLine';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';

// Structural fact, not a live metric: the hub always has exactly these 3
// top-level resource lanes (University, Field tools, Pay structure).
const HUB_LANES = ['university', 'field-tools', 'pay-structure'];

export default function ResourcesHubPage() {
  const { user } = useAuth();
  const { resources, fetchResources, fetchProgress, getOverallProgress } = useTraining();

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  const { completed, total, percentage } = getOverallProgress();
  const incompleteCount = total - completed;

  return (
    <ProtectedRoute>
      <ResourcesLineShell>
        <ResourcesLineHero
          variant="hub"
          eyebrow="Resources / The Line / signal open"
          headingLead="Keep the signal."
          headingRest="Move the work."
          context="One broadcast for the learning, address, and pay signals that keep a field rep moving with confidence."
          numeral={HUB_LANES.length}
          captionTop="resource lanes"
          captionBottom="open now"
        />

        <ResourcesLineSummaryStrip
          learningItems={resources.length}
          learningNote={`${completed} complete · ${incompleteCount} on your path`}
          fieldToolsCount={3}
          fieldToolsNote="Service checks & lookups"
          payLaneCount={1}
          payLaneNote="Role-based rate signal"
        />

        <div className="resources-line-lane-grid">
          <div className="resources-line-lane">
            <ResourcesLineLaneHead title="University" metaTop="Training lane" metaBottom={`${completed} of ${total} complete`} />
            <ResourcesLineDoorway
              incompleteCount={incompleteCount}
              completed={completed}
              total={total}
              percentage={percentage}
            />
            <ResourcesLineShortsLane />
          </div>
          <div className="resources-line-lane">
            <ResourcesLineLaneHead title="Field tools" metaTop="External links" metaBottom="opens in new tab" />
            <ResourcesLineToolList />
            <ResourcesLinePayLane />
          </div>
        </div>

        <ResourcesLineFooter />
      </ResourcesLineShell>
    </ProtectedRoute>
  );
}
