'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { ResourceGrid } from '@/components/training/ResourceGrid';
import { ProgressTracker } from '@/components/training/ProgressTracker';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { TrainingCategory, ResourceType, TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';

export default function TrainingPage() {
  const { user } = useAuth();
  const {
    resources,
    progress,
    loading,
    error,
    fetchResources,
    fetchProgress,
    getOverallProgress,
    getIncompleteRequired,
  } = useTraining();

  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | ''>('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');

  useEffect(() => {
    const filters: { category?: TrainingCategory; type?: ResourceType } = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (typeFilter) filters.type = typeFilter;
    fetchResources(filters);
  }, [categoryFilter, typeFilter, fetchResources]);

  useEffect(() => {
    if (user) {
      fetchProgress(user.uid);
    }
  }, [user, fetchProgress]);

  const overallProgress = getOverallProgress();
  const incompleteRequired = getIncompleteRequired();

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold text-[#0A1F44]">Training & Resources</h1>
                <p className="text-gray-500 mt-1">
                  Access training materials and track your learning progress
                </p>
              </div>

              {/* Progress Tracker */}
              {resources.length > 0 && <ProgressTracker {...overallProgress} />}

              {/* Required Training Alert */}
              {incompleteRequired.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-medium text-red-800">
                      You have {incompleteRequired.length} required training module{incompleteRequired.length > 1 ? 's' : ''} to complete
                    </p>
                    <p className="text-sm text-red-600 mt-1">
                      Please complete all required training to maintain compliance.
                    </p>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Category:</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value as TrainingCategory | '')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    >
                      <option value="">All Categories</option>
                      {TRAINING_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Type:</label>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as ResourceType | '')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    >
                      <option value="">All Types</option>
                      {RESOURCE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(categoryFilter || typeFilter) && (
                    <button
                      onClick={() => {
                        setCategoryFilter('');
                        setTypeFilter('');
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading && resources.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading training resources...</p>
                </div>
              ) : (
                <ResourceGrid
                  resources={resources}
                  progress={progress}
                  emptyMessage="No training resources available yet. Check back soon!"
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
