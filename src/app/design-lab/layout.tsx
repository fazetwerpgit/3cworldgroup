import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Dev-only design lab. Never reachable in production.
export default function DesignLabLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
