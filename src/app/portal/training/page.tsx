'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpenCheck, Filter, Video, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
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
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  const overallProgress = getOverallProgress();
  const incompleteRequired = getIncompleteRequired();
  const hasFilters = Boolean(categoryFilter || typeFilter);

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                        University / My Path
                      </h1>
                      <Badge variant="outline" className="rounded-md border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1d]">
                        Training desk
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">
                      Required modules, reference materials, and field refreshers organized as a clear enablement path.
                    </p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44]">
                    <BookOpenCheck className="size-5" />
                  </div>
                </div>
              </section>

              {resources.length > 0 && <ProgressTracker {...overallProgress} />}

              {incompleteRequired.length > 0 && (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    You have {incompleteRequired.length} required training module{incompleteRequired.length > 1 ? 's' : ''} to complete.
                  </AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="path" className="w-full">
                <TabsList>
                  <TabsTrigger value="path">My Path</TabsTrigger>
                  <TabsTrigger value="shorts">Shorts</TabsTrigger>
                </TabsList>

                <TabsContent value="path" className="space-y-5">
                  <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <div className="grid gap-2">
                            <Label htmlFor="training-category" className="text-sm text-slate-700">
                              Category
                            </Label>
                            <NativeSelect
                              id="training-category"
                              value={categoryFilter}
                              onChange={(event) => setCategoryFilter(event.target.value as TrainingCategory | '')}
                              className="w-full min-w-48 bg-white"
                            >
                              <option value="">All Categories</option>
                              {TRAINING_CATEGORIES.map((category) => (
                                <option key={category.value} value={category.value}>
                                  {category.label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="training-type" className="text-sm text-slate-700">
                              Type
                            </Label>
                            <NativeSelect
                              id="training-type"
                              value={typeFilter}
                              onChange={(event) => setTypeFilter(event.target.value as ResourceType | '')}
                              className="w-full min-w-40 bg-white"
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
                          <Badge variant="outline" className="border-slate-200 text-slate-500">
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
                    <Alert className="border-rose-200 bg-rose-50 text-rose-800">
                      <AlertTriangle className="size-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {loading && resources.length === 0 ? (
                    <Card className="rounded-lg border-slate-200 shadow-sm">
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
                  <Card className="overflow-hidden rounded-lg border-slate-200 bg-white py-0 shadow-sm">
                    <div className="h-1 bg-[#8dc63f]" />
                    <CardContent className="flex flex-col items-center px-6 py-12 text-center">
                      <div className="mb-5 flex size-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44]">
                        <Video className="size-7" />
                      </div>
                      <h3 className="text-lg font-semibold text-[#0A1F44]">No shorts published</h3>
                      <p className="mt-2 max-w-md text-sm text-slate-600">
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
