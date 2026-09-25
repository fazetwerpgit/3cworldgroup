// Is Ask 3C on? One env var, ASK_3C_ENABLED, serves the route and the client:
// next.config.ts inlines it into the client bundle at build time (same as
// SALE_SCAN_ENABLED). A function, not a constant, so tests can stub the env.
export function askEnabled(): boolean {
  return process.env.ASK_3C_ENABLED === 'true';
}
