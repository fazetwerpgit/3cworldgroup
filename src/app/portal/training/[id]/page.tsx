'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ref, getDownloadURL } from 'firebase/storage';
import {
  ArrowLeft,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { storage } from '@/lib/firebase/config';
import { TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';

export default function TrainingDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const { currentResource, progress, loading, error, fetchResource, fetchProgress, markComplete } = useTraining();
  const [marking, setMarking] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const resourceId = params.id as string;
  const resourceProgress = progress[resourceId];

  useEffect(() => {
    if (resourceId) fetchResource(resourceId);
  }, [resourceId, fetchResource]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  useEffect(() => {
    const path = currentResource?.storagePath;
    if (!path || !storage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFileUrl(null);
      return;
    }

    let active = true;
    getDownloadURL(ref(storage, path))
      .then((url) => {
        if (active) setFileUrl(url);
      })
      .catch(() => {
        if (active) setFileUrl(null);
      });

    return () => {
      active = false;
    };
  }, [currentResource?.storagePath]);

  const handleMarkComplete = async () => {
    if (!user || !resourceId) return;
    setMarking(true);
    await markComplete(user.uid, resourceId);
    setMarking(false);
  };

  const categoryConfig = TRAINING_CATEGORIES.find((category) => category.value === currentResource?.category);
  const typeConfig = RESOURCE_TYPES.find((type) => type.value === currentResource?.type);

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <Button asChild variant="ghost" className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground">
                <Link href="/portal/training">
                  <ArrowLeft className="size-4" />
                  Back to Training
                </Link>
              </Button>

              {loading && !currentResource && (
                <Card className="rounded-lg border-slate-200 dark:border-border shadow-sm">
                  <CardContent className="space-y-4 p-6">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-6 w-64" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              )}

              {error && (
                <Alert className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {currentResource && (
                <div className="space-y-5">
                  <section className="portal-panel portal-rail overflow-hidden rounded-lg">
                    <div className="grid gap-0 lg:grid-cols-[360px_1fr]">
                      <div className="relative min-h-56 bg-[#0A1F44]">
                        {currentResource.thumbnailUrl ? (
                          <Image
                            src={currentResource.thumbnailUrl}
                            alt={currentResource.title}
                            fill
                            unoptimized
                            sizes="(max-width: 1024px) 100vw, 360px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-56 items-center justify-center text-white/65">
                            <BookOpen className="size-16" />
                          </div>
                        )}
                      </div>
                      <div className="p-5 sm:p-6">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge className="bg-[#8dc63f]/15 text-[#4f7f1d] dark:text-green-300 hover:bg-[#8dc63f]/15">
                          {typeConfig?.label || currentResource.type}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-600 dark:text-muted-foreground">
                          {categoryConfig?.label || currentResource.category}
                        </Badge>
                        {currentResource.isRequired && (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                            Required
                          </Badge>
                        )}
                        {resourceProgress?.completed && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <CheckCircle2 className="mr-1 size-3" />
                            Completed
                          </Badge>
                        )}
                      </div>

                        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                        {currentResource.title}
                      </h1>

                      {currentResource.description && (
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-muted-foreground">
                          {currentResource.description}
                        </p>
                      )}

                      {currentResource.duration && currentResource.duration > 0 && (
                        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-muted-foreground">
                          <Clock3 className="size-4" />
                          {formatDuration(currentResource.duration)}
                        </p>
                      )}
                      </div>
                    </div>
                  </section>

                  <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
                    <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                      <CardTitle className="text-lg text-[#0A1F44] dark:text-foreground">Content</CardTitle>
                    </CardHeader>
                    <CardContent className="p-5">
                      {currentResource.storagePath && (
                        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-black">
                          {!fileUrl ? (
                            <div className="p-8 text-center text-sm text-white/70">Loading content...</div>
                          ) : currentResource.type === 'video' ? (
                            <video controls preload="metadata" src={fileUrl} className="max-h-[70vh] w-full bg-black" />
                          ) : currentResource.mimeType === 'application/pdf' ? (
                            <iframe src={fileUrl} title={currentResource.title} className="h-[75vh] w-full bg-white" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl} alt={currentResource.title} className="max-h-[75vh] w-full object-contain bg-black" />
                          )}
                        </div>
                      )}

                      {currentResource.storagePath && fileUrl && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block text-sm font-medium text-[#5a8f1f] hover:underline"
                        >
                          Open in new tab
                        </a>
                      )}

                      {currentResource.type === 'video' && currentResource.url && (
                        <div className="aspect-video overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-black">
                          <iframe
                            src={currentResource.url}
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}

                      {currentResource.type === 'document' && currentResource.url && (
                        <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-8 text-center">
                          <FileText className="mx-auto mb-3 size-12 text-[#0A1F44] dark:text-foreground" />
                          <p className="mb-4 text-sm text-slate-600 dark:text-muted-foreground">View or download the document.</p>
                          <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                            <a href={currentResource.url} target="_blank" rel="noopener noreferrer">
                              <Download className="size-4" />
                              Open Document
                            </a>
                          </Button>
                        </div>
                      )}

                      {currentResource.type === 'link' && currentResource.url && (
                        <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-8 text-center">
                          <Link2 className="mx-auto mb-3 size-12 text-[#0A1F44] dark:text-foreground" />
                          <p className="mb-4 text-sm text-slate-600 dark:text-muted-foreground">
                            This training links to an external resource.
                          </p>
                          <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                            <a href={currentResource.url} target="_blank" rel="noopener noreferrer">
                              Open External Link
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        </div>
                      )}

                      {!currentResource.url && !currentResource.storagePath && (
                        <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-8 text-center text-sm text-slate-600 dark:text-muted-foreground">
                          No content available for this resource.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-[#0A1F44] dark:text-foreground">
                          {resourceProgress?.completed ? 'Training Completed' : 'Mark as Complete'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
                          {resourceProgress?.completed
                            ? 'You have completed this training module.'
                            : 'Mark this complete after you finish reviewing the material.'}
                        </p>
                      </div>
                      {!resourceProgress?.completed && (
                        <Button
                          onClick={handleMarkComplete}
                          disabled={marking}
                          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                        >
                          {marking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          {marking ? 'Saving...' : 'Mark Complete'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
