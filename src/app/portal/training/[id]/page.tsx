'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentResource, progress, loading, error, fetchResource, fetchProgress, markComplete } = useTraining();
  const [marking, setMarking] = useState(false);

  const resourceId = params.id as string;
  const resourceProgress = progress[resourceId];

  useEffect(() => {
    if (resourceId) {
      fetchResource(resourceId);
    }
  }, [resourceId, fetchResource]);

  useEffect(() => {
    if (user) {
      fetchProgress(user.uid);
    }
  }, [user, fetchProgress]);

  const handleMarkComplete = async () => {
    if (!user || !resourceId) return;
    setMarking(true);
    await markComplete(user.uid, resourceId);
    setMarking(false);
  };

  const categoryConfig = TRAINING_CATEGORIES.find((c) => c.value === currentResource?.category);
  const typeConfig = RESOURCE_TYPES.find((t) => t.value === currentResource?.type);

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto">
              {/* Back link */}
              <Link
                href="/portal/training"
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Training
              </Link>

              {/* Loading */}
              {loading && !currentResource && (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading...</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Content */}
              {currentResource && (
                <div className="space-y-6">
                  {/* Header Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Banner */}
                    <div className="h-48 bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] flex items-center justify-center">
                      {currentResource.thumbnailUrl ? (
                        <img
                          src={currentResource.thumbnailUrl}
                          alt={currentResource.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-white/50">
                          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-6">
                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="text-xs font-medium bg-[#8dc63f]/10 text-[#8dc63f] px-2 py-1 rounded">
                          {typeConfig?.label || currentResource.type}
                        </span>
                        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {categoryConfig?.label || currentResource.category}
                        </span>
                        {currentResource.isRequired && (
                          <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                        {resourceProgress?.completed && (
                          <span className="text-xs font-medium bg-green-100 text-green-600 px-2 py-1 rounded flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Completed
                          </span>
                        )}
                      </div>

                      <h1 className="text-2xl font-bold text-[#0A1F44]">{currentResource.title}</h1>

                      {currentResource.description && (
                        <p className="text-gray-600 mt-3">{currentResource.description}</p>
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                        {currentResource.duration && currentResource.duration > 0 && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatDuration(currentResource.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content Card */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">Content</h2>

                    {currentResource.type === 'video' && currentResource.url && (
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <iframe
                          src={currentResource.url}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}

                    {currentResource.type === 'document' && currentResource.url && (
                      <div className="text-center py-8">
                        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500 mb-4">View or download the document</p>
                        <a
                          href={currentResource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Open Document
                        </a>
                      </div>
                    )}

                    {currentResource.type === 'link' && currentResource.url && (
                      <div className="text-center py-8">
                        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <p className="text-gray-500 mb-4">This training links to an external resource</p>
                        <a
                          href={currentResource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Open External Link
                        </a>
                      </div>
                    )}

                    {!currentResource.url && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No content available for this resource.</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-[#0A1F44]">
                          {resourceProgress?.completed ? 'Training Completed!' : 'Mark as Complete'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {resourceProgress?.completed
                            ? 'You have completed this training module.'
                            : 'Click the button when you have finished reviewing this material.'}
                        </p>
                      </div>
                      {!resourceProgress?.completed && (
                        <button
                          onClick={handleMarkComplete}
                          disabled={marking}
                          className="px-6 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {marking ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Mark Complete
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
