'use client';

import type { ReactNode } from 'react';
import { useIsNativeApp } from '@/lib/app/isNativeApp';

/** Renders its children only inside the 3C iOS app. Web and PWA render nothing. */
export default function AppOnly({ children }: { children: ReactNode }) {
  return useIsNativeApp() ? <>{children}</> : null;
}
