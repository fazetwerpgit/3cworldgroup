'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TrainingResource, TrainingCategory, ResourceType } from '@/types';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useCacheSubject } from '@/lib/cache/useCacheSubject';
import { dataCacheGeneration, readDataCache, readDataCacheEntry, writeDataCache } from '@/lib/cache/dataCache';

// training/progress verifies the caller from the ID token and allows self or
// management. userId stays as the TARGET row being read/written.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

interface TrainingFilters {
  category?: TrainingCategory;
  type?: ResourceType;
  required?: boolean;
}

interface UserProgress {
  [resourceId: string]: {
    completed: boolean;
    progress: number;
    lastAccessedAt: Date;
  };
}

/**
 * Progress over the published modules: completions of unpublished or deleted
 * modules (still in the rep's progress rows) don't count.
 */
export function trainingProgress(resources: TrainingResource[], progress: UserProgress) {
  const done = resources.filter((r) => progress[r.id!]?.completed);
  return {
    completed: done.length,
    total: resources.length,
    requiredLeft: resources.filter((r) => r.isRequired && !progress[r.id!]?.completed),
  };
}

function trainingQuery(filters?: TrainingFilters): string {
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.required) params.append('required', 'true');
  return params.toString();
}

const listKey = (query: string) => `training?${query}`;
const progressKey = (userId: string) => `training-progress:${userId}`;

/** The whole published list from the last visit (no filters), or undefined. */
export function readCachedTrainingList(uid: string | null | undefined): TrainingResource[] | undefined {
  return readDataCache<TrainingResource[]>(uid, listKey(''));
}

export function useTraining() {
  const uid = useCacheSubject();
  // Revisit: last time's list and the viewer's own progress show at once while
  // the page's fetches refresh them in the background.
  const [cachedList] = useState(() => readCachedTrainingList(uid));
  const [resources, setResources] = useState<TrainingResource[]>(() => cachedList ?? []);
  const [currentResource, setCurrentResource] = useState<TrainingResource | null>(null);
  const [progress, setProgress] = useState<UserProgress>(
    () => (uid ? readDataCache<UserProgress>(uid, progressKey(uid)) : undefined) ?? {}
  );
  // Whose progress is on screen, so a local update keeps that copy current.
  const progressOwner = useRef<string | null>(null);
  // The generation this screen mounted under: after an account switch its
  // progress copy is not written into the new account's cache.
  const [mountGen] = useState(dataCacheGeneration);
  useEffect(() => {
    if (progressOwner.current) writeDataCache(uid, progressKey(progressOwner.current), progress, mountGen);
  }, [progress, uid, mountGen]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The module asked for is deleted or unpublished (a 404): retrying can't bring it back.
  const [missing, setMissing] = useState(false);

  // After a background refresh failed with a list still showing: when that
  // list was loaded, for the quiet "Couldn't refresh · as of" note.
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const lastGoodAt = useRef<number | null>(null);

  /**
   * Loads the list for `filters`. `quiet` (pull to refresh) keeps whatever is
   * on screen: no skeleton, no error box; a failure only sets `staleAt`.
   * Resolves to the fresh list, or null when the request failed.
   */
  const fetchResources = useCallback(async (
    filters?: TrainingFilters,
    { quiet = false }: { quiet?: boolean } = {}
  ): Promise<TrainingResource[] | null> => {
    const query = trainingQuery(filters);
    const gen = dataCacheGeneration();
    // Seen before: show it now and refresh in the background (no skeleton, and
    // a failed refresh keeps the list rather than an error).
    const entry = readDataCacheEntry<TrainingResource[]>(uid, listKey(query));
    const cached = entry?.value;
    if (cached) {
      setResources(cached);
      lastGoodAt.current = entry.at;
    } else if (!quiet) {
      setLoading(true);
    }
    if (!quiet) setError(null);

    try {
      const response = await fetch(`/api/portal/training?${query}`, {
        headers: await authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch training resources');
      }

      writeDataCache(uid, listKey(query), data.resources, gen);
      lastGoodAt.current = Date.now();
      setStaleAt(null);
      setResources(data.resources);
      return data.resources as TrainingResource[];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch training resources';
      if (cached || quiet) {
        console.error('Background training refresh failed:', message);
        if (lastGoodAt.current !== null) setStaleAt(lastGoodAt.current);
      } else {
        setError(message);
      }
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [uid]);

  const fetchResource = useCallback(async (id: string): Promise<TrainingResource | null> => {
    setLoading(true);
    setError(null);
    setMissing(false);

    try {
      const response = await fetch(`/api/portal/training/${id}`, {
        headers: await authHeaders(),
      });
      if (response.status === 404) {
        setMissing(true);
        return null;
      }
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch training resource');
      }

      setCurrentResource(data.resource);
      return data.resource;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch training resource';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProgress = useCallback(async (userId: string) => {
    try {
      const response = await fetch(
        `/api/portal/training/progress?userId=${userId}`,
        { headers: await authHeaders() }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch progress');
      }

      progressOwner.current = userId;
      setProgress(data.progress);
    } catch (err) {
      console.error('Error fetching progress:', err);
    }
  }, []);

  const updateProgress = useCallback(async (
    userId: string,
    resourceId: string,
    completed: boolean,
    progressValue: number
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/portal/training/progress', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          userId,
          resourceId,
          completed,
          progress: progressValue,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update progress');
      }

      // Update local state
      setProgress((prev) => ({
        ...prev,
        [resourceId]: {
          completed,
          progress: progressValue,
          lastAccessedAt: new Date(),
        },
      }));

      return true;
    } catch (err) {
      console.error('Error updating progress:', err);
      return false;
    }
  }, []);

  const markComplete = useCallback(async (userId: string, resourceId: string): Promise<boolean> => {
    return updateProgress(userId, resourceId, true, 100);
  }, [updateProgress]);

  // Calculate overall progress
  const getOverallProgress = useCallback((): { completed: number; total: number; percentage: number } => {
    const { completed, total } = trainingProgress(resources, progress);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, [resources, progress]);

  // Get required resources that are not completed
  const getIncompleteRequired = useCallback((): TrainingResource[] => {
    return trainingProgress(resources, progress).requiredLeft;
  }, [resources, progress]);

  return {
    /** The list came from the last visit's copy (a background refresh is due). */
    seeded: cachedList !== undefined,
    resources,
    staleAt,
    currentResource,
    progress,
    loading,
    error,
    missing,
    fetchResources,
    fetchResource,
    fetchProgress,
    updateProgress,
    markComplete,
    getOverallProgress,
    getIncompleteRequired,
  };
}
