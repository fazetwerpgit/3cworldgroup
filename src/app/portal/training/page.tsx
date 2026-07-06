'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Filter, Video, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { ResourceGrid } from '@/components/training/ResourceGrid';
import { ProgressTracker } from '@/components/training/ProgressTracker';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrainingCategory, ResourceType, TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';

type TrainingTab = 'path' | 'shorts';

const HEADER_COPY: Record<TrainingTab, { title: string; description: string }> = {
  path: {
    title: 'University / My Path',
    description:
      'Required modules, reference materials, and field refreshers organized as a clear enablement path.',
  },
  shorts: {
    title: 'Shorts',
    description:
      'Short-form training clips and quick field refreshers you can watch between appointments.',
  },
};

function TrainingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
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

  const overallProgress = getOverallProgress();
  const incompleteRequired = getIncompleteRequired();
  const hasFilters = Boolean(categoryFilter || typeFilter);
  const headerCopy = HEADER_COPY[activeTab];

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <PortalPageHeader
                eyebrow="Training desk"
                title={headerCopy.title}
                description={headerCopy.description}
              />

              {resources.length > 0 && <ProgressTracker {...overallProgress} />}

              {incompleteRequired.length > 0 && (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    You have {incompleteRequired.length} required training module{incompleteRequired.length > 1 ? 's' : ''} to complete.
                  </AlertDescription>
                </Alert>
              )}

              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as TrainingTab)}
                className="portal-enter portal-enter-2 w-full"
              >
                <TabsList>
                  <TabsTrigger value="path">My Path</TabsTrigger>
                  <TabsTrigger value="shorts">Shorts</TabsTrigger>
                </TabsList>

                <TabsContent value="path" className="space-y-5">
                  <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <div className="grid gap-2">
                            <Label className="text-sm text-slate-700 dark:text-muted-foreground">Carrier</Label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setCategoryFilter('')}
                                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                  categoryFilter === ''
                                    ? 'border-[#8dc63f] bg-[#8dc63f]/10 text-[#5a8f1f]'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
                                }`}
                              >
                                All
                              </button>
                              {TRAINING_CATEGORIES.map((category) => (
                                <button
                                  key={category.value}
                                  type="button"
                                  onClick={() => setCategoryFilter(category.value)}
                                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                    categoryFilter === category.value
                                      ? 'border-[#8dc63f] bg-[#8dc63f]/10 text-[#5a8f1f]'
                                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
                                  }`}
                                >
                                  {category.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="training-type" className="text-sm text-slate-700 dark:text-muted-foreground">
                              Type
                            </Label>
                            <NativeSelect
                              id="training-type"
                              value={typeFilter}
                              onChange={(event) => setTypeFilter(event.target.value as ResourceType | '')}
                              className="w-full min-w-40 bg-white dark:bg-card"
                            >
                              <option value="">All Types</option>
                              {RESOURCE_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground">
                            <Filter className="mr-1 size-3" />
                            {resources.length} visible
                          </Badge>
                          {hasFilters && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCategoryFilter('');
                                setTypeFilter('');
                              }}
                            >
                              <X className="size-4" />
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {error && (
                    <Alert className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                      <AlertTriangle className="size-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {loading && resources.length === 0 ? (
                    <Card className="rounded-lg border-slate-200 dark:border-border shadow-sm">
                      <CardContent className="space-y-4 p-6">
                        <Skeleton className="h-6 w-52" />
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-28 w-full" />
                      </CardContent>
                    </Card>
                  ) : (
                    <ResourceGrid
                      resources={resources}
                      progress={progress}
                      emptyMessage="No training resources are available yet."
                    />
                  )}
                </TabsContent>

                <TabsContent value="shorts">
                  <Card className="overflow-hidden rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                    <div className="h-1 bg-[#8dc63f]" />
                    <CardContent className="flex flex-col items-center px-6 py-12 text-center">
                      <div className="mb-5 flex size-14 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                        <Video className="size-7" />
                      </div>
                      <h3 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">No shorts published</h3>
                      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-muted-foreground">
                        Short-form training clips and quick field refreshers will appear here once Operations publishes them.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function TrainingLoadingFallback() {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1500px] space-y-5">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function TrainingPage() {
  return (
    <Suspense fallback={<TrainingLoadingFallback />}>
      <TrainingContent />
    </Suspense>
  );
}
