'use client';

import { TrainingResource } from '@/types';
import { ResourceCard } from './ResourceCard';

interface ResourceGridProps {
  resources: TrainingResource[];
  progress?: Record<string, { completed: boolean; progress: number }>;
  emptyMessage?: string;
}

export function ResourceGrid({ resources, progress, emptyMessage }: ResourceGridProps) {
  if (resources.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <p className="text-gray-500">{emptyMessage || 'No training resources found'}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {resources.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          progress={progress?.[resource.id!]}
        />
      ))}
    </div>
  );
}
