'use client';

import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';

// Shared shell for the Member "The Line" round (Settings / Onboarding). Real
// PortalHeader/PortalSidebar render — the mockup's masthead/ticker/pill-nav
// chrome does not ship (member-the-line-goal.md, Sanctioned deviations).
export function MemberLineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="member-line-main flex-1 overflow-auto">
          <div className="member-line">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function MemberLineMasthead({
  kicker,
  headingLead,
  headingRest,
  intro,
  numeral,
  numeralAriaLabel,
  tools,
}: {
  kicker: string;
  headingLead: string;
  headingRest: string;
  intro: string;
  numeral: number;
  numeralAriaLabel: string;
  tools?: React.ReactNode;
}) {
  return (
    <div className="member-line-masthead">
      <div>
        <p className="member-line-kicker">{kicker}</p>
        <h1>
          <span className="accent">{headingLead}</span>
          <span>{headingRest}</span>
        </h1>
        <p className="member-line-intro">{intro}</p>
        {tools && <div className="member-line-tools">{tools}</div>}
      </div>
      <div
        className="member-line-display portal-metallic-num portal-num"
        aria-label={numeralAriaLabel}
      >
        {numeral}
      </div>
    </div>
  );
}

export function MemberLineSectionIndex({ index, label }: { index: string; label: string }) {
  return (
    <div className="member-line-section-index">
      <b>{index}</b>
      <span>/ {label}</span>
    </div>
  );
}

export function MemberLineLock() {
  return (
    <svg
      className="member-line-lock"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
