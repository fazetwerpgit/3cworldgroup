import type { HTMLAttributes } from "react";

type PublicSectionProps = HTMLAttributes<HTMLElement> & {
  tone?: "white" | "pale" | "navy";
};

export function PublicSection({
  className = "",
  tone = "white",
  ...props
}: PublicSectionProps) {
  return (
    <section
      className={`public-section public-section-${tone} ${className}`.trim()}
      {...props}
    />
  );
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={`public-section-heading public-section-heading-${align}`}>
      {eyebrow ? <p className="public-eyebrow">{eyebrow}</p> : null}
      <h2 className="public-section-title">{title}</h2>
      {intro ? <p className="public-section-intro">{intro}</p> : null}
    </div>
  );
}
