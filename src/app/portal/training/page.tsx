'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import {
  ResourcesLineShell,
  ResourcesLineRequiredStrip,
  ResourcesLineTabs,
  ResourcesLineFilterGroups,
  ResourcesLineCardGrid,
  ResourcesLineShortsEmpty,
  ResourcesLineLaneHead,
} from '@/components/resources/ResourcesLine';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { TrainingCategory, ResourceType } from '@/types';
import '@/styles/sweep-rep-a.css';

type TrainingTab = 'path' | 'shorts';

function TrainingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const {
    resources,
    progress,
    fetchResources,
    fetchProgress,
    getIncompleteRequired,
  } = useTraining();

  const initialTab: TrainingTab = searchParams.get('tab') === 'shorts' ? 'shorts' : 'path';
  const [activeTab, setActiveTab] = useState<TrainingTab>(initialTab);
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | ''>('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [unfilteredResourceCount, setUnfilteredResourceCount] = useState(0);

  useEffect(() => {
    const filters: { category?: TrainingCategory; type?: ResourceType } = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (typeFilter) filters.type = typeFilter;
    fetchResources(filters);
  }, [categoryFilter, typeFilter, fetchResources]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadCount = async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/portal/training', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!response.ok) return;
        const data = await response.json() as { resources?: unknown[] };
        if (active) setUnfilteredResourceCount(data.resources?.length ?? 0);
      } catch {
        // The filtered list still renders when the count request is unavailable.
      }
    };
    void loadCount();
    return () => { active = false; };
  }, [user]);

  const incompleteRequired = getIncompleteRequired();

  return (
    <ProtectedRoute permissions={['training:read']}>
      <ResourcesLineShell>
        <PageTitle title="University" meta={`${resources.length} modules`} />

        <ResourcesLineRequiredStrip count={incompleteRequired.length} />

        <div className="resources-line-uni-toolbar">
          <ResourcesLineTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === 'path' && unfilteredResourceCount >= 4 && (
            <ResourcesLineFilterGroups
              category={categoryFilter}
              onCategory={(value) => setCategoryFilter(value as TrainingCategory | '')}
              type={typeFilter}
              onType={(value) => setTypeFilter(value as ResourceType | '')}
            />
          )}
        </div>

        {activeTab === 'path' ? (
          <ResourcesLineCardGrid resources={resources} progress={progress} />
        ) : (
          <section className="resources-line-uni-shorts" aria-label="Shorts library">
            <ResourcesLineLaneHead title="Short videos" metaTop="Quick lessons" metaBottom="for the field" />
            <ResourcesLineShortsEmpty university />
          </section>
        )}

      </ResourcesLineShell>
    </ProtectedRoute>
  );
}

function TrainingLoadingFallback() {
  return (
    <ResourcesLineShell>
      <div className="resources-line-uni-head" />
    </ResourcesLineShell>
  );
}

export default function TrainingPage() {
  return (
    <Suspense fallback={<TrainingLoadingFallback />}>
      <TrainingContent />
    </Suspense>
  );
}
