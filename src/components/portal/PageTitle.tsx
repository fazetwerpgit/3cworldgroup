import type { ReactNode } from 'react';
import '@/styles/page-title.css';

interface PageTitleProps {
  /** Plain page name a rep would say out loud: "Sales", "Calls", "Fiber Reports". */
  title: string;
  /** Live figure shown inline next to the title, e.g. "0 this month", "6 waiting". */
  meta?: string;
  /** One short plain sentence, only when the page needs it. */
  subtitle?: string;
  /** Primary action(s), rendered right of the title on desktop, below on phone. */
  actions?: ReactNode;
  /** Optional back link rendered above the title. */
  back?: ReactNode;
  className?: string;
}

/**
 * The one page header for the portal (2026-09 UX sweep). Replaces the
 * per-page slogan mastheads: no eyebrow, no decorative digit, no paragraph.
 * Title + live number + at most one sentence + the page's main action.
 */
export function PageTitle({ title, meta, subtitle, actions, back, className = '' }: PageTitleProps) {
  return (
    <header className={`pt-head ${className}`.trim()}>
      {back}
      <div className="pt-head-row">
        <div className="pt-head-text">
          <h1 className="pt-head-title">
            {title}
            {meta && <span className="pt-head-meta">{meta}</span>}
          </h1>
          {subtitle && <p className="pt-head-sub">{subtitle}</p>}
        </div>
        {actions && <div className="pt-head-actions">{actions}</div>}
      </div>
    </header>
  );
}

export default PageTitle;
