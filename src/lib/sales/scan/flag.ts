// Is the Log Sale screenshot reader on? One env var, SALE_SCAN_ENABLED, serves
// the scan route and the client: next.config.ts inlines it into the client
// bundle at build time. A function, not a constant, so tests can stub the env.
export function saleScanEnabled(): boolean {
  return process.env.SALE_SCAN_ENABLED === 'true';
}
