'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { TrainingCategory, ResourceType, TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';
import { LoadFailed, ModuleList, ProgressCard, RowsSkeleton, ShortsEmpty } from '@/components/portal/rep/RepLearn';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import l from '@/components/portal/rep/rep-learn.module.css';

// Learn's "Training" tab (the old University page). The Learn page owns the
// title and shows this tab only with training:read; ?view=shorts opens Short videos.

type TrainingTab = 'path' | 'shorts';

export function Training() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const {
    resources,
    progress,
    error,
    fetchResources,
    fetchProgress,
    getIncompleteRequired,
  } = useTraining();

  const initialTab: TrainingTab = searchParams.get('view') === 'shorts' ? 'shorts' : 'path';
  const [activeTab, setActiveTab] = useState<TrainingTab>(initialTab);
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | ''>('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [unfilteredResourceCount, setUnfilteredResourceCount] = useState(0);
  // The hook starts with an empty list; don't show "no modules" before the first answer.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${categoryFilter}|${typeFilter}|${reloadKey}`;

  useEffect(() => {
    const filters: { category?: TrainingCategory; type?: ResourceType } = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (typeFilter) filters.type = typeFilter;
    let active = true;
    void fetchResources(filters).then(() => {
      if (active) setLoadedKey(`${categoryFilter}|${typeFilter}|${reloadKey}`);
    });
    return () => {
      active = false;
    };
  }, [categoryFilter, typeFilter, reloadKey, fetchResources]);

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

  const loaded = loadedKey === requestKey;
  const incompleteRequired = getIncompleteRequired();
  const totalModules = Math.max(unfilteredResourceCount, resources.length);
  const completedModules = Object.values(progress).filter((entry) => entry.completed).length;
  const showFilters = activeTab === 'path' && unfilteredResourceCount >= 4;
  const filtered = Boolean(categoryFilter || typeFilter);

  return (
    <div className={l.layout}>
      <div className={`${l.col} ${l.side}`}>
        {totalModules > 0 ? (
          <ProgressCard
            completed={Math.min(completedModules, totalModules)}
            total={totalModules}
            requiredLeft={incompleteRequired.length}
          />
        ) : null}
      </div>

      <div className={`${l.col} ${l.main}`}>
        <div className={l.toolbar}>
          <div className={p.tabs} role="tablist" aria-label="University sections">
            <button className={p.tab} type="button" role="tab" aria-selected={activeTab === 'path'} onClick={() => setActiveTab('path')}>
              My training
            </button>
            <button className={p.tab} type="button" role="tab" aria-selected={activeTab === 'shorts'} onClick={() => setActiveTab('shorts')}>
              Short videos
            </button>
          </div>

          {showFilters && (
            <div className={l.filters}>
              <div className={p.chipRow} role="group" aria-label="Carrier filter">
                <button className={p.chip} type="button" aria-pressed={categoryFilter === ''} onClick={() => setCategoryFilter('')}>
                  All carriers
                </button>
                {TRAINING_CATEGORIES.map((c) => (
                  <button key={c.value} className={p.chip} type="button" aria-pressed={categoryFilter === c.value} onClick={() => setCategoryFilter(c.value)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className={p.chipRow} role="group" aria-label="Type filter">
                <button className={p.chip} type="button" aria-pressed={typeFilter === ''} onClick={() => setTypeFilter('')}>
                  All types
                </button>
                {RESOURCE_TYPES.map((t) => (
                  <button key={t.value} className={p.chip} type="button" aria-pressed={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeTab === 'path' ? (
          <section className={s.panel} aria-label="Training modules">
            {!loaded ? (
              <RowsSkeleton label="Loading training" />
            ) : error ? (
              <LoadFailed what="training" onRetry={() => setReloadKey((k) => k + 1)} />
            ) : resources.length === 0 ? (
              <div className={p.empty}>
                <div>
                  <strong>{filtered ? 'Nothing matches these filters' : 'No training modules yet'}</strong>
                  <p>{filtered ? 'Try another carrier or type.' : 'Modules show up here once they are published.'}</p>
                </div>
              </div>
            ) : (
              <ModuleList resources={resources} progress={progress} />
            )}
          </section>
        ) : (
          <section className={s.panel} aria-labelledby="shorts-title">
            <div className={s.panelHead}>
              <h2 id="shorts-title" className={s.kicker}>Short videos</h2>
              <span className={p.rowSub}>Quick lessons for the field</span>
            </div>
            <ShortsEmpty />
          </section>
        )}
      </div>
    </div>
  );
}
