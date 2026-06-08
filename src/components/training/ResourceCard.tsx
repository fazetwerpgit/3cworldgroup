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
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/60 hover:shadow-md motion-reduce:transform-none"
    >
      <div className="relative flex h-36 items-center justify-center bg-[#0A1F44]">
        {resource.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.thumbnailUrl}
            alt={resource.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-white/50">
            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332-.477-4.5-1.253" />
            </svg>
          </div>
        )}

        {progress && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div
              className="h-full bg-[#8dc63f] transition-all"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        )}

        {progress?.completed && (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-[#8dc63f] px-2 py-1 text-xs font-semibold text-[#0A1F44]">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Complete
          </div>
        )}

        {resource.isRequired && !progress?.completed && (
          <div className="absolute left-3 top-3 rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white">
            Required
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-[#5a8f1f]">
            {typeConfig?.label || resource.type}
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-xs text-slate-500">
            {categoryConfig?.label || resource.category}
          </span>
        </div>

        <h3 className="line-clamp-2 font-semibold text-[#0A1F44] transition-colors group-hover:text-[#5a8f1f]">
          {resource.title}
        </h3>

        {resource.description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">
            {resource.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {resource.duration && resource.duration > 0 ? (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(resource.duration)}
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-[#5a8f1f] transition-transform group-hover:translate-x-1">
            {progress?.completed ? 'Review' : 'Start'} -&gt;
          </span>
        </div>
      </div>
    </Link>
  );
}
