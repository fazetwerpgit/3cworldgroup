import type { Metadata } from 'next';
import n from '../native.module.css';
import { Shell } from '../_components/Shell';
import { DashboardView } from '../_components/DashboardView';

export const metadata: Metadata = { title: 'Home · B Native · Design lab' };

export default function NativeDashboardPage() {
  return (
    <div className={n.root}>
      <Shell active="home">
        <DashboardView />
      </Shell>
    </div>
  );
}
