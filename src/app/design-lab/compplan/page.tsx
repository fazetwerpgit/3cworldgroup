import { CompPlanHarness } from './CompPlanHarness';

// Temporary harness (untracked, never committed): /portal/resources layout
// with the owner comp plan, no auth. ?edit=1 shows inputs; ?place=panel mounts
// the matrix inside the Pay structure panel (the pre-fix placement).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return <CompPlanHarness edit={params.edit === '1'} inPanel={params.place === 'panel'} />;
}
