'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe2,
  GraduationCap,
  ListChecks,
  PlayCircle,
  RadioTower,
  RotateCw,
} from 'lucide-react';
import { RESOURCE_TYPES, TRAINING_CATEGORIES, type ResourceType, type TrainingResource } from '@/types';
import s from './rep.module.css';
import p from './rep-page.module.css';
import l from './rep-learn.module.css';

// Real field-tool links on the Resources hub (never a mockup's demo set).
export const RESOURCE_QUICK_LINKS = [
  {
    title: 'TFiber Service Check',
    description: 'Check whether TFiber service is available at a customer address.',
    url: 'https://www.t-mobile.com/isp',
    icon: RadioTower,
  },
  {
    title: 'AT&T Fiber Availability',
    description: 'Check AT&T Fiber availability by address.',
    url: 'https://www.att.com/internet/fiber/',
    icon: FileCheck2,
  },
  {
    title: 'Frontier Availability',
    description: 'Check Frontier Fiber service availability.',
    url: 'https://frontier.com/',
    icon: Globe2,
  },
] as const;

export type ModuleProgress = Record<string, { completed: boolean; progress: number } | undefined>;

export function ModuleTypeIcon({ type, size = 20 }: { type: ResourceType | string; size?: number }) {
  if (type === 'video') return <PlayCircle size={size} aria-hidden="true" />;
  if (type === 'document') return <FileText size={size} aria-hidden="true" />;
  if (type === 'quiz') return <ListChecks size={size} aria-hidden="true" />;
  return <ExternalLink size={size} aria-hidden="true" />;
}

export function moduleMeta(resource: Pick<TrainingResource, 'type' | 'category' | 'duration'>): string {
  const type = RESOURCE_TYPES.find((t) => t.value === resource.type)?.label ?? resource.type;
  const category = TRAINING_CATEGORIES.find((c) => c.value === resource.category)?.label ?? resource.category;
  const parts = [type];
  if (resource.duration && resource.duration > 0) parts.push(`${resource.duration} min`);
  if (category) parts.push(category);
  return parts.join(' · ');
}

/** "2/6 complete" with a bar; optional required-left line and a link row. */
export function ProgressCard({
  completed,
  total,
  requiredLeft = 0,
  loading = false,
  link,
}: {
  completed: number;
  total: number;
  requiredLeft?: number;
  loading?: boolean;
  link?: { href: string; label: string };
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <section className={`${s.panel} ${l.progress}`} aria-labelledby="uni-progress-title">
      <div className={l.progressBody}>
        <h2 id="uni-progress-title" className={s.kicker}>
          Your training
        </h2>
        {total > 0 ? (
          <>
            <p className={l.progressFigure}>
              <span className={l.progressNum}>
                {completed}
                <small>/{total}</small>
              </span>
              <span className={l.progressLabel}>modules complete</span>
            </p>
            <div
              className={s.track}
              role="progressbar"
              aria-label="Training complete"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span className={s.fill} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : loading ? (
          <span className={`${s.skel} ${l.skelFigure}`} aria-label="Loading progress" />
        ) : (
          <p className={p.hint}>No modules published yet.</p>
        )}
      </div>
      {requiredLeft > 0 ? (
        <p className={l.required}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>
              {requiredLeft} required module{requiredLeft === 1 ? '' : 's'} left.
            </strong>{' '}
            Finish {requiredLeft === 1 ? 'it' : 'these'} before your next shift.
          </span>
        </p>
      ) : null}
      {link ? (
        <Link href={link.href} className={`${p.row} ${l.progressLink}`}>
          <span className={`${p.tile} ${p.tileLime}`}>
            <GraduationCap size={20} aria-hidden="true" />
          </span>
          <span className={p.rowTitle}>{link.label}</span>
          <ChevronRight size={18} className={p.chev} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

function ModuleStatus({ required, progress }: { required: boolean; progress?: { completed: boolean; progress: number } }) {
  if (progress?.completed) {
    return (
      <span className={l.statusDone}>
        <Check size={14} aria-hidden="true" /> Done
      </span>
    );
  }
  if (required) return <span className={`${p.tag} ${p.tagAmber}`}>Required</span>;
  if (progress && progress.progress > 0) return <span className={`${p.tag} ${p.tagBlue}`}>{progress.progress}%</span>;
  return <span className={l.statusIdle}>Not started</span>;
}

export function ModuleList({ resources, progress }: { resources: TrainingResource[]; progress: ModuleProgress }) {
  return (
    <ul className={p.rows}>
      {resources.map((resource) => {
        const prog = progress[resource.id];
        const done = Boolean(prog?.completed);
        const required = resource.isRequired && !done;
        const tone = done ? p.tileLime : required ? p.tileAmber : p.tile;
        return (
          <li key={resource.id}>
            <Link href={`/portal/training/${resource.id}`} className={`${p.row} ${l.module}`}>
              <span className={`${p.tile} ${tone}`}>
                <ModuleTypeIcon type={resource.type} />
              </span>
              <span className={p.rowText}>
                <span className={p.rowTitle}>{resource.title}</span>
                <span className={p.rowSub}>{moduleMeta(resource)}</span>
                {!done && prog && prog.progress > 0 ? (
                  <span className={`${s.track} ${l.moduleBar}`} aria-hidden="true">
                    <span className={s.fill} style={{ width: `${prog.progress}%` }} />
                  </span>
                ) : null}
              </span>
              <span className={l.status}>
                <ModuleStatus required={required} progress={prog} />
              </span>
              <ChevronRight size={18} className={`${p.chev} ${l.chevCell}`} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ShortsEmpty() {
  return (
    <div className={p.empty}>
      <span className={`${p.tile} ${p.tileMuted}`}>
        <PlayCircle size={20} aria-hidden="true" />
      </span>
      <div>
        <strong>No short videos yet</strong>
        <p>Quick field lessons show up here when they&apos;re ready.</p>
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={p.skelRow}>
          <span className={`${s.skel} ${p.skelTile}`} />
          <span className={p.skelLines}>
            <span className={`${s.skel} ${p.skelLine}`} />
            <span className={`${s.skel} ${p.skelLineShort}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className={s.failed} role="alert">
      <span>Couldn&apos;t load {what}</span>
      <button type="button" className={s.retry} onClick={onRetry}>
        <RotateCw size={14} aria-hidden="true" /> Retry
      </button>
    </div>
  );
}
