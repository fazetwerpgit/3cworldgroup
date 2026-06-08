'use client';

import { Clapperboard, Radio, Video } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Card, CardContent } from '@/components/ui/card';

export default function ShortsPage() {
  return (
    <ProtectedRoute permissions={['shorts:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                        Shorts
                      </h1>
                      <div className="inline-flex items-center rounded-md border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-2.5 py-1 text-xs font-medium text-[#4f7f1d]">
                        Field media
                      </div>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">
                      Short-form training clips and quick field refreshers for the University path.
                    </p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44]">
                    <Clapperboard className="size-5" />
                  </div>
                </div>
              </section>

              <Card className="overflow-hidden rounded-lg border-slate-200 bg-white py-0 shadow-sm">
                <div className="h-1 bg-[#8dc63f]" />
                <CardContent className="flex flex-col items-center px-6 py-12 text-center">
                  <div className="mb-5 flex size-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44]">
                    <Video className="size-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#0A1F44]">No shorts published</h3>
                  <p className="mt-2 max-w-md text-sm text-slate-600">
                    Operations has not added short-form training clips yet. Published clips will appear here.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                    <Radio className="size-3.5 text-[#4f7f1d]" />
                    Waiting on published clips
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
