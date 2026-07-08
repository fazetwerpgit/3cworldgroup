'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ESIGN_HELPER_TEXT, isEsignItem } from '@/lib/onboarding/esign';
import type { OnboardingItem, OnboardingStatus } from '@/types/onboarding';
import { OnboardingCategoryLabels } from '@/types/onboarding';

export interface WizardItem extends OnboardingItem {
  status: OnboardingStatus;
  reference: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

interface Props {
  items: WizardItem[];
  progress: { approved: number; total: number; complete: boolean };
  renderItemAction: (item: WizardItem) => ReactNode;
}

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_started: 'To do',
  submitted: 'In review',
  approved: 'Done',
  rejected: 'Needs attention',
};

export default function OnboardingWizard({ items, progress, renderItemAction }: Props) {
  const ordered = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const firstOpen = ordered.find((item) => item.status !== 'approved')?.id ?? ordered[0]?.id;
  const [activeId, setActiveId] = useState<string | undefined>();
  const lastAutoId = useRef<string | undefined>(undefined);

  useEffect(() => {
    setActiveId((current) => {
      const activeStillExists = current
        ? ordered.some((item) => item.id === current)
        : false;

      if (!current || !activeStillExists) {
        lastAutoId.current = firstOpen;
        return firstOpen;
      }

      if (current === lastAutoId.current && firstOpen !== lastAutoId.current) {
        lastAutoId.current = firstOpen;
        return firstOpen;
      }

      return current;
    });
  }, [firstOpen, ordered]);

  const active = ordered.find((item) => item.id === activeId);
  const pct = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);

  return (
    <div className="portal-enter portal-enter-2 grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="self-start lg:sticky lg:top-4">
        <Card className="rounded-lg border-border bg-card py-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-card-foreground">
                {progress.approved}/{progress.total} complete
              </p>
              <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-3 h-2" />
            {progress.complete && (
              <p className="mt-3 text-sm text-muted-foreground">
                You&apos;re all set - a manager will activate your account.
              </p>
            )}
          </CardContent>
        </Card>

        <ol className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {ordered.map((item) => {
            const selected = item.id === activeId;
            const label = item.status === 'submitted' && isEsignItem(item.id)
              ? 'Awaiting signature'
              : STATUS_LABEL[item.status];

            return (
              <li key={item.id} className="min-w-[13rem] lg:min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  aria-current={selected ? 'step' : undefined}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary/10 text-card-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted'
                  )}
                >
                  <StatusIcon status={item.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <Card className="min-h-64 rounded-lg border-border bg-card py-0 shadow-sm">
        {active ? (
          <>
            <CardHeader className="border-b border-border p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight text-card-foreground">
                      {active.label}
                    </h2>
                    <Badge variant="outline" className="rounded-md border-border text-muted-foreground">
                      {OnboardingCategoryLabels[active.category] ?? active.category}
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <StatusIcon status={active.status} />
                    {getStatusLine(active)}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit rounded-md border-border text-muted-foreground">
                  Step {ordered.findIndex((item) => item.id === active.id) + 1} of {ordered.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {active.status === 'rejected' && active.rejectionReason && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-semibold">
                    Returned{active.reviewerName ? ` by ${active.reviewerName}` : ''}
                  </p>
                  <p className="mt-1">{active.rejectionReason}</p>
                </div>
              )}

              {isEsignItem(active.id) && active.status !== 'approved' ? (
                <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
                  {ESIGN_HELPER_TEXT}
                </div>
              ) : (
                renderItemAction(active)
              )}
            </CardContent>
          </>
        ) : (
          <CardContent className="p-5 text-sm text-muted-foreground">
            No onboarding steps are assigned yet.
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function getStatusLine(item: WizardItem) {
  if (item.status === 'submitted' && isEsignItem(item.id)) {
    return 'Awaiting signature';
  }

  if (item.status === 'submitted' && item.submittedAt) {
    return `Submitted ${formatDate(item.submittedAt)} - awaiting review`;
  }

  if (item.status === 'approved' && item.reviewedAt) {
    return `Approved ${formatDate(item.reviewedAt)}${
      item.reviewerName ? ` by ${item.reviewerName}` : ''
    }`;
  }

  return STATUS_LABEL[item.status];
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusIcon({ status }: { status: OnboardingStatus }) {
  if (status === 'approved') {
    return <CheckCircle2 className="size-4 shrink-0 text-primary" />;
  }

  if (status === 'submitted') {
    return <Clock className="size-4 shrink-0 text-muted-foreground" />;
  }

  if (status === 'rejected') {
    return <AlertTriangle className="size-4 shrink-0 text-destructive" />;
  }

  return <Circle className="size-4 shrink-0 text-muted-foreground/50" />;
}
