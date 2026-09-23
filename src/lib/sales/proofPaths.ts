// Proof screenshots on a sale. A sale may carry up to MAX_PROOF_SCREENSHOTS
// (a customer's order details are sometimes split across two screens).
//
// Storage: each screenshot is its own upload folder,
//   form-attachments/{repUid}/sale-proof/{slot}/
// Records: `proofScreenshotPaths` holds every folder; `proofScreenshotPath` is
// still written as the first one so older readers keep working. Old sales only
// have the single field, so ALWAYS read through saleProofPaths().

export const MAX_PROOF_SCREENSHOTS = 4;

const cleanPath = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Every proof folder on a sale (array first, then the legacy single field), de-duplicated. */
export function saleProofPaths(sale: { proofScreenshotPaths?: unknown; proofScreenshotPath?: unknown }): string[] {
  const list = Array.isArray(sale.proofScreenshotPaths) ? sale.proofScreenshotPaths.map(cleanPath) : [];
  const single = cleanPath(sale.proofScreenshotPath);
  const all = [...list, single].filter(Boolean);
  return [...new Set(all)];
}

/** The prefix a rep's own sale-proof uploads live under. */
export function saleProofPrefix(repUid: string): string {
  return `form-attachments/${repUid}/sale-proof/`;
}

/** Same ownership + prefix rule the single path always had, plus no path traversal. */
export function isOwnSaleProofPath(path: string, repUid: string): boolean {
  return Boolean(repUid) && path.startsWith(saleProofPrefix(repUid)) && !path.includes('..');
}

export type ProofPathsResult = { ok: true; paths: string[] } | { ok: false; error: string };

/**
 * Validate the proof paths a client sent (array and/or legacy single field) for
 * a sale owned by `repUid`. Every path must pass the ownership/prefix check, and
 * there may be at most MAX_PROOF_SCREENSHOTS.
 *
 * `options.alsoAllow` widens the check for an edit: the uploader's own uid when
 * an admin attaches proof to a rep's sale (uploads land under the uploader's
 * prefix), and the paths the sale already stores (they passed this check when
 * they were written, whoever uploaded them).
 */
export function validateProofPaths(
  input: { proofScreenshotPaths?: unknown; proofScreenshotPath?: unknown },
  repUid: string,
  options: { alsoAllow?: { uids?: string[]; paths?: string[] } } = {}
): ProofPathsResult {
  if (input.proofScreenshotPaths !== undefined && input.proofScreenshotPaths !== null) {
    if (!Array.isArray(input.proofScreenshotPaths) || input.proofScreenshotPaths.some((p) => typeof p !== 'string')) {
      return { ok: false, error: 'Invalid proof screenshots' };
    }
  }
  if (input.proofScreenshotPath !== undefined && input.proofScreenshotPath !== null && typeof input.proofScreenshotPath !== 'string') {
    return { ok: false, error: 'Invalid proof screenshot' };
  }
  const paths = saleProofPaths(input);
  if (paths.length > MAX_PROOF_SCREENSHOTS) {
    return { ok: false, error: `Attach at most ${MAX_PROOF_SCREENSHOTS} proof screenshots` };
  }
  const uids = [repUid, ...(options.alsoAllow?.uids ?? [])];
  const stored = new Set(options.alsoAllow?.paths ?? []);
  const allowed = (path: string) =>
    stored.has(path) || uids.some((uid) => isOwnSaleProofPath(path, uid));
  if (paths.some((path) => !allowed(path))) {
    return { ok: false, error: 'Invalid proof screenshot path' };
  }
  return { ok: true, paths };
}

/** Fields to store on the sale: the array plus the legacy first-path mirror. */
export function proofPathFields(paths: string[]): { proofScreenshotPaths: string[]; proofScreenshotPath: string } {
  return { proofScreenshotPaths: paths, proofScreenshotPath: paths[0] ?? '' };
}

/**
 * Upload slot for ONE proof screenshot of a sale. The upload route clears the
 * slot folder before writing, so every screenshot needs its own slot:
 * `{saleKey}_{6 hex}` (matches the sale-proof slot rule [A-Za-z0-9_-]{8,64}).
 */
export function newProofSlot(saleKey: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `${saleKey.slice(0, 57)}_${suffix}`;
}
