'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Clock3,
  Edit3,
  ExternalLink,
  FileCheck2,
  Globe2,
  RadioTower,
  Save,
} from 'lucide-react';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  ratesArePending,
  CommissionConfig,
  FieldRole,
  RoleDisplayNames,
  ResourceType,
  TrainingResource,
  TRAINING_CATEGORIES,
  RESOURCE_TYPES,
} from '@/types';

// Real field-tool links (carries into the hub's Field tools lane verbatim -
// never the mockup's demo Xfinity/Frontier/Brightspeed set).
export const RESOURCE_QUICK_LINKS = [
  {
    title: 'TFiber Service Check',
    description: 'Check whether TFiber service is available at a customer address.',
    url: 'https://www.t-mobile.com/isp',
    category: 'Service Tools',
    icon: RadioTower,
  },
  {
    title: 'AT&T Fiber Availability',
    description: 'Check AT&T Fiber availability by address.',
    url: 'https://www.att.com/internet/fiber/',
    category: 'Service Tools',
    icon: FileCheck2,
  },
  {
    title: 'Frontier Availability',
    description: 'Check Frontier Fiber service availability.',
    url: 'https://frontier.com/',
    category: 'Service Tools',
    icon: Globe2,
  },
] as const;

interface PayStructureResponse {
  tiers: CommissionConfig[];
  scope: 'own' | 'all';
  updatedAt: string | null;
  updatedByName: string | null;
}

const TIER_NOTES: Record<FieldRole, string> = {
  entry_rep: 'Commission on your own approved sales.',
  entry_level_rep: 'Entry-level onboarding role; commission begins after promotion.',
  l1_manager: 'Commission on your own sales plus an override on your team.',
  l2_manager: 'Commission on your own sales plus an override on your organization.',
  ibo_level_1: 'Commission on your own sales plus an IBO team override.',
  ibo_level_2: 'Commission on your own sales plus an IBO team override.',
  ibo_level_3: 'Commission on your own sales plus an IBO team override.',
  ibo_level_4: 'Commission on your own sales plus an IBO team override.',
  general_manager: 'General Manager commission on your own sales plus an override on your team.',
  gm_in_training: 'GM in Training commission on your own approved sales.',
  office_manager: 'Office Manager commission on your own sales plus an override on your team.',
};

export function ResourcesLineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="resources-line-main flex-1 overflow-auto">
          <div className="resources-line">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function ResourcesLineHero({
  variant,
  eyebrow,
  headingLead,
  headingRest,
  context,
  numeral,
  captionTop,
  captionBottom,
}: {
  variant: 'hub' | 'university';
  eyebrow: string;
  headingLead: string;
  headingRest: string;
  context: string;
  numeral: number;
  captionTop: string;
  captionBottom: string;
}) {
  const headingId = variant === 'hub' ? 'resources-line-hub-title' : 'resources-line-uni-title';
  return (
    <header className={variant === 'hub' ? 'resources-line-head' : 'resources-line-uni-head'}>
      <div>
        <p className="resources-line-eyebrow">{eyebrow}</p>
        <h1 id={headingId}>
          <span>{headingLead}</span>
          <br />
          {headingRest}
        </h1>
        <p className="resources-line-context">{context}</p>
      </div>
      <div className={variant === 'hub' ? 'resources-line-head-count' : 'resources-line-uni-count'}>
        <strong className="resources-line-display portal-metallic-num">{numeral}</strong>
        <small>
          {captionTop}
          <br />
          {captionBottom}
        </small>
      </div>
    </header>
  );
}

export function ResourcesLineSummaryStrip({
  learningItems,
  learningNote,
  fieldToolsCount,
  fieldToolsNote,
  payLaneCount,
  payLaneNote,
}: {
  learningItems: number;
  learningNote: string;
  fieldToolsCount: number;
  fieldToolsNote: string;
  payLaneCount: number;
  payLaneNote: string;
}) {
  return (
    <section className="resources-line-signal-strip" aria-label="Resources summary">
      <div className="resources-line-signal">
        <span className="resources-line-signal-label">Learning items</span>
        <strong className="resources-line-signal-value portal-metallic-num">{learningItems}</strong>
        <span className="resources-line-signal-note">{learningNote}</span>
      </div>
      <div className="resources-line-signal">
        <span className="resources-line-signal-label">Field tools</span>
        <strong className="resources-line-signal-value portal-metallic-num">{fieldToolsCount}</strong>
        <span className="resources-line-signal-note">{fieldToolsNote}</span>
      </div>
      <div className="resources-line-signal">
        <span className="resources-line-signal-label">Pay structure</span>
        <strong className="resources-line-signal-value portal-metallic-num">{payLaneCount}</strong>
        <span className="resources-line-signal-note">{payLaneNote}</span>
      </div>
    </section>
  );
}

export function ResourcesLineLaneHead({ title, metaTop, metaBottom }: { title: string; metaTop: string; metaBottom: string }) {
  return (
    <div className="resources-line-lane-head">
      <h2>{title}</h2>
      <p>
        {metaTop}
        <br />
        {metaBottom}
      </p>
    </div>
  );
}

export function ResourcesLineDoorway({
  incompleteCount,
  completed,
  total,
  percentage,
}: {
  incompleteCount: number;
  completed: number;
  total: number;
  percentage: number;
}) {
  const heading = incompleteCount > 0
    ? <>{incompleteCount} item{incompleteCount === 1 ? '' : 's'} left<br />on your path.</>
    : <>Your path is clear.<br />Keep moving.</>;
  return (
    <section className="resources-line-doorway" aria-labelledby="resources-line-doorway-title">
      <p className="resources-line-eyebrow">My path / required items stay visible</p>
      <h2 id="resources-line-doorway-title">{heading}</h2>
      <p>Keep the essentials together, then return to the field with the route clear.</p>
      <div className="resources-line-doorway-meta"><span>Path progress</span><strong>{total} items · {completed} complete</strong></div>
      <div className="resources-line-progress" aria-label={`${completed} of ${total} complete`}><span style={{ width: `${percentage}%` }} /></div>
      <Link className="resources-line-primary" href="/portal/training">
        Enter University <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

export function ResourcesLineToolList() {
  return (
    <div className="resources-line-tool-list">
      {RESOURCE_QUICK_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <article className="resources-line-tool-row" key={link.title}>
            <Icon className="resources-line-tool-icon" aria-hidden="true" />
            <div>
              <strong>{link.title}</strong>
              <span>
                {link.category} /{' '}
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  open in new tab <ExternalLink aria-hidden="true" />
                </a>
              </span>
            </div>
            <ExternalLink className="resources-line-tool-arrow" aria-hidden="true" />
          </article>
        );
      })}
    </div>
  );
}

export function ResourcesLineShortsEmpty({ university = false }: { university?: boolean }) {
  return (
    <div className={university ? 'resources-line-uni-shorts-empty' : 'resources-line-shorts-empty'}>
      <div className="resources-line-empty-icon" aria-hidden="true">
        <RadioTower />
      </div>
      <div>
        <strong>No shorts published</strong>
        <p>Short-form training clips and quick field refreshers will appear here once Operations publishes them.</p>
      </div>
    </div>
  );
}

export function ResourcesLineShortsLane() {
  return (
    <section className="resources-line-short-lane" aria-labelledby="resources-line-shorts-title">
      <div className="resources-line-short-head">
        <h2 id="resources-line-shorts-title">Shorts</h2>
        <Link href="/portal/training?tab=shorts">View all in University <ArrowLeftRight aria-hidden="true" /></Link>
      </div>
      <ResourcesLineShortsEmpty />
    </section>
  );
}

export function ResourcesLinePayLane() {
  const { user, isRole } = useAuth();
  const [data, setData] = useState<PayStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CommissionConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const isAdmin = isRole('admin');

  const fetchStructure = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/portal/commission?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pay structure');
      setData(json);
      setDraft(json.tiers);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pay structure');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStructure();
  }, [fetchStructure]);

  const updateDraft = (fieldRole: FieldRole, key: 'baseRate' | 'overrideRate', value: string) => {
    setDraft((previous) => previous.map((tier) => (
      tier.fieldRole === fieldRole ? { ...tier, [key]: Number(value) || 0 } : tier
    )));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/portal/commission', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: draft,
          updatedBy: user.uid,
          updatedByName: user.displayName || user.email,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to save');
      setEditing(false);
      setSuccess('Pay structure updated');
      window.setTimeout(() => setSuccess(''), 3000);
      await fetchStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const tiers = editing ? draft : data?.tiers ?? [];
  const ratesPending = data ? ratesArePending(data.tiers) : false;
  const ownTier = data?.scope === 'own' ? data.tiers[0] : undefined;

  return (
    <section className="resources-line-pay-lane" aria-labelledby="resources-line-pay-title">
      <div className="resources-line-pay-head">
        <h2 id="resources-line-pay-title">Pay structure</h2>
        {isAdmin && data?.scope === 'all' && !editing && (
          <button className="resources-line-edit-rates" type="button" onClick={() => { setDraft(data.tiers); setEditing(true); }}>
            <Edit3 aria-hidden="true" /> Edit rates <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>

      {error && <div className="resources-line-status resources-line-status-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div>}
      {success && <div className="resources-line-status resources-line-status-success" role="status"><Save aria-hidden="true" />{success}</div>}
      {ratesPending && !loading && (
        <div className="resources-line-status resources-line-status-pending" role="status">
          <Clock3 aria-hidden="true" />
          <span>Final commission rates are being confirmed by leadership. Current numbers are placeholders.</span>
        </div>
      )}

      {loading ? (
        <div className="resources-line-pay-skeleton" aria-label="Loading pay structure">
          <span /><span /><span />
        </div>
      ) : data?.scope === 'own' ? (
        <div className="resources-line-commission">
          <span className="resources-line-commission-label">Your rate</span>
          <strong>
            {ownTier ? RoleDisplayNames[ownTier.fieldRole] : 'Your tier'} — base <em>{ownTier?.baseRate ?? 0}%</em> · override {ownTier?.overrideRate == null ? '—' : `${ownTier.overrideRate}%`}
          </strong>
          <small>{ownTier?.notes || TIER_NOTES[ownTier?.fieldRole ?? 'entry_rep']}</small>
        </div>
      ) : (
        <div className="resources-line-admin-pay">
          <div className="resources-line-rate-grid">
            {tiers.map((tier) => (
              <div className="resources-line-rate" key={tier.fieldRole}>
                <strong>{RoleDisplayNames[tier.fieldRole]}</strong>
                {editing ? (
                  <>
                    <label>
                      Base
                      <input
                        className="resources-line-rate-input"
                        type="number"
                        min="0"
                        step="0.5"
                        value={tier.baseRate}
                        onChange={(event) => updateDraft(tier.fieldRole, 'baseRate', event.target.value)}
                        aria-label={`Base rate for ${RoleDisplayNames[tier.fieldRole]}`}
                      />
                    </label>
                    {tier.overrideRate !== undefined && (
                      <label>
                        Override
                        <input
                          className="resources-line-rate-input"
                          type="number"
                          min="0"
                          step="0.5"
                          value={tier.overrideRate}
                          onChange={(event) => updateDraft(tier.fieldRole, 'overrideRate', event.target.value)}
                          aria-label={`Override rate for ${RoleDisplayNames[tier.fieldRole]}`}
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <span>{tier.baseRate}%{tier.overrideRate === undefined ? '' : ` + ${tier.overrideRate}%`}</span>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <div className="resources-line-edit-actions">
              <button type="button" onClick={() => { setEditing(false); setDraft(data?.tiers ?? []); }} disabled={saving}>Cancel</button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}>
                <Save aria-hidden="true" /> {saving ? 'Saving...' : 'Save rates'}
              </button>
            </div>
          )}
        </div>
      )}

      {data?.updatedAt && (
        <p className="resources-line-updated">
          Last updated {new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {data.updatedByName ? ` by ${data.updatedByName}` : ''}
        </p>
      )}
    </section>
  );
}

export function ResourcesLineFooter({ university = false, completed, total }: { university?: boolean; completed?: number; total?: number }) {
  return (
    <footer className={university ? 'resources-line-uni-foot' : 'resources-line-footer'}>
      <span>{university ? 'University / My Path / progress signal' : 'The Line / resources broadcast'}</span>
      <span>{university ? `${completed ?? 0} of ${total ?? 0} complete` : 'Make the next move legible.'}</span>
    </footer>
  );
}

export function ResourcesLineTypeIcon({ type }: { type: ResourceType | string }) {
  if (type === 'video') return <RadioTower className="resources-line-card-type-icon" aria-hidden="true" />;
  if (type === 'document') return <FileCheck2 className="resources-line-card-type-icon" aria-hidden="true" />;
  if (type === 'quiz') return <Check className="resources-line-card-type-icon" aria-hidden="true" />;
  return <ExternalLink className="resources-line-card-type-icon" aria-hidden="true" />;
}

export function ResourcesLineRequiredStrip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="resources-line-required-strip">
      <strong>Required training is waiting.</strong>
      <span>{count} required item{count === 1 ? '' : 's'} incomplete · clear these before the next shift</span>
    </div>
  );
}

export function ResourcesLineUniProgress({ completed, total, percentage }: { completed: number; total: number; percentage: number }) {
  return (
    <>
      <div className="resources-line-uni-progress">
        <span>Path progress</span>
        <strong>{completed} of {total} complete</strong>
      </div>
      <div className="resources-line-uni-progress-bar"><span style={{ width: `${percentage}%` }} /></div>
    </>
  );
}

export function ResourcesLineTabs({
  active,
  onChange,
}: {
  active: 'path' | 'shorts';
  onChange: (tab: 'path' | 'shorts') => void;
}) {
  return (
    <div className="resources-line-tabs" role="tablist" aria-label="University sections">
      <button className="resources-line-tab" type="button" role="tab" aria-selected={active === 'path'} onClick={() => onChange('path')}>My Path</button>
      <button className="resources-line-tab" type="button" role="tab" aria-selected={active === 'shorts'} onClick={() => onChange('shorts')}>Shorts</button>
    </div>
  );
}

export function ResourcesLineFilterGroups({
  category,
  onCategory,
  type,
  onType,
}: {
  category: string;
  onCategory: (value: string) => void;
  type: string;
  onType: (value: string) => void;
}) {
  return (
    <div className="resources-line-filter-groups">
      <div className="resources-line-filters" aria-label="Carrier filter">
        <button className="resources-line-filter" type="button" aria-pressed={category === ''} onClick={() => onCategory('')}>All</button>
        {TRAINING_CATEGORIES.map((c) => (
          <button key={c.value} className="resources-line-filter" type="button" aria-pressed={category === c.value} onClick={() => onCategory(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="resources-line-filters" aria-label="Type filter">
        <button className="resources-line-filter" type="button" aria-pressed={type === ''} onClick={() => onType('')}>All types</button>
        {RESOURCE_TYPES.map((t) => (
          <button key={t.value} className="resources-line-filter" type="button" aria-pressed={type === t.value} onClick={() => onType(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatCardMeta(typeLabel: string, duration?: number) {
  return duration && duration > 0 ? `${typeLabel} · ${duration} min` : typeLabel;
}

export function ResourcesLineCard({
  resource,
  progress,
}: {
  resource: TrainingResource;
  progress?: { completed: boolean; progress: number };
}) {
  const categoryConfig = TRAINING_CATEGORIES.find((c) => c.value === resource.category);
  const typeConfig = RESOURCE_TYPES.find((t) => t.value === resource.type);
  const isRequired = resource.isRequired && !progress?.completed;
  const state = progress?.completed ? 'complete' : (progress && progress.progress > 0 ? 'in-progress' : 'not-started');
  const stateLabel = state === 'complete' ? 'Complete' : state === 'in-progress' ? 'In progress' : 'Not started';

  return (
    <Link
      href={`/portal/training/${resource.id}`}
      className={`resources-line-card${isRequired ? ' resources-line-card-required' : ''}`}
    >
      <div className="resources-line-card-top">
        <ResourcesLineTypeIcon type={resource.type} />
        <span className="resources-line-card-tag">{isRequired ? 'Required' : (categoryConfig?.label ?? resource.category)}</span>
      </div>
      <h3>{resource.title}</h3>
      <div className="resources-line-card-meta">
        <span>{formatCardMeta(typeConfig?.label ?? resource.type, resource.duration)}</span>
        <span className={state === 'complete' ? 'resources-line-card-state-complete' : undefined}>
          {state === 'complete' && <Check aria-hidden="true" />}
          {stateLabel}
        </span>
      </div>
      <div className="resources-line-card-bar"><span style={{ width: `${progress?.progress ?? 0}%` }} /></div>
    </Link>
  );
}

export function ResourcesLineCardGrid({
  resources,
  progress,
}: {
  resources: TrainingResource[];
  progress?: Record<string, { completed: boolean; progress: number }>;
}) {
  if (resources.length === 0) {
    return (
      <div className="resources-line-shorts-empty">
        <div className="resources-line-empty-icon" aria-hidden="true"><FileCheck2 /></div>
        <div>
          <strong>No training resources yet</strong>
          <p>No training resources are available yet.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="resources-line-card-grid" id="resources-line-card-grid">
      {resources.map((resource) => (
        <ResourcesLineCard key={resource.id} resource={resource} progress={progress?.[resource.id!]} />
      ))}
    </div>
  );
}
