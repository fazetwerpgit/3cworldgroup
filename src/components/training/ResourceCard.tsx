'use client';

import Link from 'next/link';
import { TrainingResource, TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';

interface ResourceCardProps {
  resource: TrainingResource;
  progress?: { completed: boolean; progress: number };
}

export function ResourceCard({ resource, progress }: ResourceCardProps) {
  const categoryConfig = TRAINING_CATEGORIES.find((c) => c.value === resource.category);
  const typeConfig = RESOURCE_TYPES.find((t) => t.value === resource.type);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <Link
      href={`/portal/training/${resource.id}`}
      className="block bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-[#8dc63f]/30 transition-all group"
    >
      {/* Thumbnail */}
      <div className="relative h-40 bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] flex items-center justify-center">
        {resource.thumbnailUrl ? (
          <img
            src={resource.thumbnailUrl}
            alt={resource.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-white/50">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}

        {/* Progress overlay */}
        {progress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-[#8dc63f] transition-all"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        )}

        {/* Completed badge */}
        {progress?.completed && (
          <div className="absolute top-3 right-3 bg-[#8dc63f] text-white text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Completed
          </div>
        )}

        {/* Required badge */}
        {resource.isRequired && !progress?.completed && (
          <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-medium px-2 py-1 rounded-full">
            Required
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Type & Category */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-[#8dc63f] uppercase">
            {typeConfig?.label || resource.type}
          </span>
          <span className="text-gray-300">•</span>
          <span className="text-xs text-gray-500">
            {categoryConfig?.label || resource.category}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-[#0A1F44] group-hover:text-[#8dc63f] transition-colors line-clamp-2">
          {resource.title}
        </h3>

        {/* Description */}
        {resource.description && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2">
            {resource.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          {resource.duration && resource.duration > 0 ? (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(resource.duration)}
            </span>
          ) : (
            <span></span>
          )}
          <span className="text-xs text-[#8dc63f] font-medium group-hover:translate-x-1 transition-transform">
            {progress?.completed ? 'Review' : 'Start'} →
          </span>
        </div>
      </div>
    </Link>
  );
}
