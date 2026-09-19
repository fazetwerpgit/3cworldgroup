import type { HTMLAttributes } from "react";

type PublicContainerProps = HTMLAttributes<HTMLDivElement>;

export function PublicContainer({ className = "", ...props }: PublicContainerProps) {
  return <div className={`public-container ${className}`.trim()} {...props} />;
}
