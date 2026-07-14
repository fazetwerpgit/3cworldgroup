'use client';

import type { ReactNode } from 'react';

/**
 * Shared "manage a list of things" anatomy for the Admin Management redesign
 * (email templates / chat channels / form options / university content).
 * Owns hero + toolbar + grid + empty-state chrome; each real page supplies
 * its own cards/editor via children so real fields/auth/handlers never get
 * forced into a one-size-fits-all data shape.
 */

interface AdminCatalogCategoryOption {
  value: string;
  label: string;
}

interface AdminCatalogListProps {
  kicker: string;
  heroAccent: string;
  heroPlain: string;
  intro: string;
  heroCount: number;
  heroCountLabel: string;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
  };
  categoryFilter?: {
    value: string;
    onChange: (value: string) => void;
    options: AdminCatalogCategoryOption[];
  };
  toolbarExtra?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  success?: string | null;
  isEmpty: boolean;
  isFilteredEmpty: boolean;
  emptyTrue: { title: string; body: string; action?: ReactNode };
  emptyFiltered: { title: string; body: string; action?: ReactNode };
  gridClassName?: string;
  children: ReactNode;
}

export function AdminCatalogList({
  kicker,
  heroAccent,
  heroPlain,
  intro,
  heroCount,
  heroCountLabel,
  search,
  categoryFilter,
  toolbarExtra,
  loading,
  loadingLabel = 'Loading records...',
  error,
  success,
  isEmpty,
  isFilteredEmpty,
  emptyTrue,
  emptyFiltered,
  gridClassName = 'admin-line-catalog-grid',
  children,
}: AdminCatalogListProps) {
  return (
    <div className="admin-line-main">
      <div className="admin-line">
        <header className="admin-line-hero">
          <div>
            <div className="admin-line-kicker">{kicker}</div>
            <h1>
              <span className="accent">{heroAccent}</span>
              <span className="plain">{heroPlain}</span>
            </h1>
            <p className="admin-line-intro">{intro}</p>
          </div>
          <div className="admin-line-hero-count">
            <span className="admin-line-display portal-metallic-num">{heroCount}</span>
            <small>{heroCountLabel}</small>
          </div>
        </header>

        {(search || categoryFilter || toolbarExtra) && (
          <div className="admin-line-catalog-toolbar">
            {search && (
              <input
                className="admin-line-search"
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                aria-label={search.ariaLabel}
              />
            )}
            {categoryFilter && (
              <div className="admin-line-pill-row" role="group" aria-label="Filter by category">
                {categoryFilter.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={categoryFilter.value === opt.value}
                    onClick={() => categoryFilter.onChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {toolbarExtra}
          </div>
        )}

        {error && (
          <div className="admin-line-empty-state" style={{ borderColor: 'var(--admin-line-red)', color: 'var(--admin-line-red)' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="admin-line-empty-state" style={{ borderColor: 'var(--admin-line-lime)', color: 'var(--admin-line-lime)', borderStyle: 'solid' }}>
            {success}
          </div>
        )}

        {loading ? (
          <div className="admin-line-empty-state">
            <strong>{loadingLabel}</strong>
          </div>
        ) : (
          <>
            <div className={gridClassName} style={{ display: isEmpty ? 'none' : undefined }}>
              {children}
            </div>

            {isEmpty && isFilteredEmpty && (
              <div className="admin-line-quiet-empty" style={{ display: 'block' }}>
                <strong>{emptyFiltered.title}</strong>
                {emptyFiltered.body}
                {emptyFiltered.action}
              </div>
            )}

            {isEmpty && !isFilteredEmpty && (
              <div className="admin-line-empty-state" style={{ display: 'block' }}>
                <strong>{emptyTrue.title}</strong>
                {emptyTrue.body}
                {emptyTrue.action}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface AdminConfirmStripProps {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  confirmLabel?: string;
  /** Label shown on the confirm button while the action is in flight.
   * Defaults to the original delete-flow copy for backward compatibility. */
  confirmingLabel?: string;
}

/** The inline "Delete <X>? / Cancel / Yes" strip, standardized across every
 * confirm-before-action flow this round (Delete on People/email
 * templates/university, and Accept on People). */
export function AdminConfirmStrip({
  label,
  onCancel,
  onConfirm,
  confirming,
  confirmLabel = 'Yes',
  confirmingLabel = 'Deleting…',
}: AdminConfirmStripProps) {
  return (
    <div className="admin-line-confirm-strip">
      <span>{label}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onCancel} disabled={confirming}>
          Cancel
        </button>
        <button type="button" className="yes" onClick={onConfirm} disabled={confirming}>
          {confirming ? confirmingLabel : confirmLabel}
        </button>
      </span>
    </div>
  );
}

interface AdminCatalogCardProps {
  eyebrow: string;
  title: string;
  statusLabel?: string;
  statusTone?: 'lime' | 'muted';
  subject?: string;
  preview?: string;
  metaLeft?: string;
  metaRight?: string;
  extra?: ReactNode;
  actions: ReactNode;
  confirmStrip?: ReactNode;
}

/** Presentational catalog card shell shared by all 4 adopting pages. */
export function AdminCatalogCard({
  eyebrow,
  title,
  statusLabel,
  statusTone = 'muted',
  subject,
  preview,
  metaLeft,
  metaRight,
  extra,
  actions,
  confirmStrip,
}: AdminCatalogCardProps) {
  return (
    <article className="admin-line-catalog-card">
      <div className="admin-line-catalog-top">
        <div>
          <div className="admin-line-eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        {statusLabel && (
          <span className={`admin-line-chip ${statusTone === 'lime' ? 'lime' : ''}`}>{statusLabel}</span>
        )}
      </div>
      {subject && <p className="subject">{subject}</p>}
      {preview && <p className="preview">{preview}</p>}
      {extra}
      {(metaLeft || metaRight) && (
        <div className="admin-line-catalog-meta">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      )}
      <div className="admin-line-catalog-actions">{actions}</div>
      {confirmStrip}
    </article>
  );
}
