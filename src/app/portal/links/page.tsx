'use client';

import { ExternalLink, Info, RadioTower, Route, ShieldCheck } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const quickLinks = [
  {
    title: 'TFiber Service Check',
    description: 'Check whether TFiber service is available at a customer address.',
    url: 'https://www.t-mobile.com/isp',
    category: 'Service Tools',
  },
  {
    title: 'AT&T Fiber Availability',
    description: 'Check AT&T Fiber availability by address.',
    url: 'https://www.att.com/internet/fiber/',
    category: 'Service Tools',
  },
  {
    title: 'Frontier Availability',
    description: 'Check Frontier Fiber service availability.',
    url: 'https://frontier.com/',
    category: 'Service Tools',
  },
];

export default function LinksPage() {
  const categories = [...new Set(quickLinks.map((link) => link.category))];

  return (
    <ProtectedRoute permissions={['links:read']}>
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
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                        Quick Links
                      </h1>
                      <Badge variant="outline" className="rounded-md border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1d] dark:text-green-300">
                        Field reference
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                      Approved service checks and field reference links for repeated sales workflows.
                    </p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                    <Route className="size-5" />
                  </div>
                </div>
              </section>

              {categories.map((category) => (
                <section key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-muted-foreground">
                      {category}
                    </h2>
                    <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground">
                      {quickLinks.filter((link) => link.category === category).length} links
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {quickLinks
                      .filter((link) => link.category === category)
                      .map((link) => (
                        <a
                          key={link.title}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-5 shadow-sm transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/70 hover:shadow-md motion-reduce:transform-none"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground transition-colors duration-200 group-hover:border-[#8dc63f]/50 group-hover:bg-[#8dc63f]/10">
                              <RadioTower className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-foreground transition-colors duration-200 group-hover:text-[#4f7f1d] dark:group-hover:text-green-300">
                                {link.title}
                                <ExternalLink className="size-4 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
                              </h3>
                              <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">{link.description}</p>
                            </div>
                          </div>
                        </a>
                      ))}
                  </div>
                </section>
              ))}

              <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-[#0A1F44] dark:text-foreground">
                    <ShieldCheck className="size-4 text-[#4f7f1d] dark:text-green-300" />
                    Resource Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground">
                    Send missing or outdated resource links to operations so this list stays current.
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                    <Info className="size-3.5" />
                    Use approved links only when checking address availability with customers.
                  </p>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
