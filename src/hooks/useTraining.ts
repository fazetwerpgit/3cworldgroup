'use client';

import { useState, useCallback } from 'react';
import { TrainingResource, TrainingCategory, ResourceType } from '@/types';

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

export function useTraining() {
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [currentResource, setCurrentResource] = useState<TrainingResource | null>(null);
  const [progress, setProgress] = useState<UserProgress>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async (filters?: TrainingFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.required) params.append('required', 'true');

      const response = await fetch(`/api/portal/training?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch training resources');
      }

      setResources(data.resources);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch training resources';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResource = useCallback(async (id: string): Promise<TrainingResource | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/portal/training/${id}`);
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
      const response = await fetch(`/api/portal/training/progress?userId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch progress');
      }

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
        headers: { 'Content-Type': 'application/json' },
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
    const total = resources.length;
    const completed = Object.values(progress).filter((p) => p.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, [resources, progress]);

  // Get required resources that are not completed
  const getIncompleteRequired = useCallback((): TrainingResource[] => {
    return resources.filter(
      (r) => r.isRequired && !progress[r.id!]?.completed
    );
  }, [resources, progress]);

  return {
    resources,
    currentResource,
    progress,
    loading,
    error,
    fetchResources,
    fetchResource,
    fetchProgress,
    updateProgress,
    markComplete,
    getOverallProgress,
    getIncompleteRequired,
  };
}
