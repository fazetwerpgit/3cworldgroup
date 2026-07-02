import { ReactNode } from 'react';

interface PortalPageHeaderProps {
  /** Small uppercase context line above the title, e.g. "Sales workspace". */
  eyebrow: string;
  title: string;
  description?: string;
  /** Right side: action buttons (Button components). */
  actions?: ReactNode;
  /** Right side: stat cluster (takes the actions slot; use one or the other). */
  stats?: ReactNode;
  /** Tighter padding + smaller title for sub/admin pages. */
  compact?: boolean;
  className?: string;
}

/**
 * The navy command band — the locked header pattern for every portal page
 * (ANCHOR.md §4). Grid texture, one lime radial glow, Archivo display title,
 * uppercase eyebrow. In dark mode an inset ring keeps the band distinct from
 * the canvas.
 */
export function PortalPageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
  compact = false,
  className = '',
}: PortalPageHeaderProps) {
  return (
    <section
      className={`portal-enter relative overflow-hidden rounded-lg bg-[#0A1F44] text-white dark:ring-1 dark:ring-inset dark:ring-white/10 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 45% 90% at 8% 100%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 28px 28px, 28px 28px',
        }}
      />
      <div
        className={`relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${
          compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'
        }`}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
            {eyebrow}
          </p>
          <h1
            className={`portal-display mt-1.5 font-extrabold tracking-tight ${
              compact ? 'text-2xl' : 'text-3xl'
            }`}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm text-white/60">{description}</p>
          )}
        </div>
        {(stats || actions) && (
          <div className="flex flex-wrap items-end gap-2">{stats ?? actions}</div>
        )}
      </div>
    </section>
  );
}
