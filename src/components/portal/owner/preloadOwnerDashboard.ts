// Starts downloading the owner dashboard's chunk (the same one the dashboard
// page's dynamic() import loads) the moment a profile, remembered or real,
// says owner, so the company view does not wait on it after the shell paints.
// Code only: no data is read. Safe to call any number of times.
let started: Promise<unknown> | null = null;

export function preloadOwnerDashboard(): void {
  started ??= import('@/components/portal/owner/OwnerDashboard').catch(() => {
    started = null; // a failed fetch may be retried by the page itself
  });
}
