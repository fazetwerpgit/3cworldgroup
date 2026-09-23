'use client';

import type { ReactNode } from 'react';
import { useSheetExit } from '@/hooks/useSheetExit';
import m from './collapse.module.css';

/** The close (collapse.module.css .collapse[data-closing]). */
const COLLAPSE_EXIT_MS = 200;

/**
 * Expand/collapse content that opens and closes smoothly: height by the grid
 * 1fr/0fr trick, with a fade. Closed, the content is not rendered at all, as
 * with `{open && ...}`; it stays for the close, inert. `className` and `id`
 * land on the content box (aria-controls targets it); its padding and borders
 * fold away with it, inside the clipping track.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const { rendered, closing } = useSheetExit(open, COLLAPSE_EXIT_MS);
  if (!rendered) return null;
  return (
    <div className={m.collapse} data-closing={closing || undefined} inert={closing || undefined}>
      <div className={m.content}>
        <div id={id} className={className}>
          {children}
        </div>
      </div>
    </div>
  );
}
