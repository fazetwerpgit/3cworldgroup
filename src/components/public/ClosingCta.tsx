"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

type ClosingCtaProps = {
  eyebrow?: string;
  title?: string;
  body?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export default function ClosingCta({
  eyebrow = "Your next move",
  title = "Ready to build what is next?",
  body = "Bring your ambition, and we will bring the training, support, and momentum to help you move forward.",
  primaryLabel = "Apply Now",
  primaryHref = "/apply",
  secondaryLabel = "Meet the team",
  secondaryHref = "/culture",
}: ClosingCtaProps) {
  const headingId = `public-closing-cta-${useId().replace(/:/g, "")}`;

  return (
    <section className="public-closing-cta public-topo-surface" aria-labelledby={headingId}>
      <div className="public-container">
        <div className="public-closing-cta-panel">
          <div className="public-closing-cta-copy">
            <p className="public-eyebrow public-eyebrow-dark">{eyebrow}</p>
            <h2 id={headingId} className="public-closing-cta-title">{title}</h2>
            <p className="public-closing-cta-body">{body}</p>
          </div>
          <div className="public-closing-cta-actions">
            <Link href={primaryHref} className="public-button public-button-navy">
              {primaryLabel}
              <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} />
            </Link>
            {secondaryLabel && secondaryHref ? (
              <Link href={secondaryHref} className="public-closing-cta-secondary">
                {secondaryLabel}
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
