'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  ResourcesLineShell,
  ResourcesLineHero,
  ResourcesLineRequiredStrip,
  ResourcesLineUniProgress,
  ResourcesLineTabs,
  ResourcesLineFilterGroups,
  ResourcesLineCardGrid,
  ResourcesLineShortsEmpty,
  ResourcesLineFooter,
  ResourcesLineLaneHead,
} from '@/components/resources/ResourcesLine';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { TrainingCategory, ResourceType } from '@/types';

type TrainingTab = 'path' | 'shorts';

function TrainingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const {
    resources,
    progress,
    fetchResources,
    fetchProgress,
    getOverallProgress,
    getIncompleteRequired,
  } = useTraining();

  const initialTab: TrainingTab = searchParams.get('tab') === 'shorts' ? 'shorts' : 'path';
  const [activeTab, setActiveTab] = useState<TrainingTab>(initialTab);
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | ''>('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');

  useEffect(() => {
    const filters: { category?: TrainingCategory; type?: ResourceType } = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (typeFilter) filters.type = typeFilter;
    fetchResources(filters);
  }, [categoryFilter, typeFilter, fetchResources]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  const { completed, total, percentage } = getOverallProgress();
  const incompleteRequired = getIncompleteRequired();

  return (
    <ProtectedRoute permissions={['training:read']}>
      <ResourcesLineShell>
        <ResourcesLineHero
          variant="university"
          eyebrow="University / training broadcast / my path"
          headingLead="Learn the line."
          headingRest="Keep moving."
          context={`${incompleteRequired.length} item${incompleteRequired.length === 1 ? '' : 's'} left on your path. Required work stays at the top; every card below carries one clear next state.`}
          numeral={incompleteRequired.length}
          captionTop="items left"
          captionBottom="on your path"
        />

        <ResourcesLineRequiredStrip count={incompleteRequired.length} />
        <ResourcesLineUniProgress completed={completed} total={total} percentage={percentage} />

        <div className="resources-line-uni-toolbar">
          <ResourcesLineTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === 'path' && (
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
            <ResourcesLineLaneHead title="Shorts library" metaTop="Fast cuts" metaBottom="field pace" />
            <ResourcesLineShortsEmpty university />
          </section>
        )}

        <ResourcesLineFooter university completed={completed} total={total} />
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
