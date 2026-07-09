export function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true;
  if (!(error instanceof Error)) return false;

  // Chrome reports fetches cancelled by a route/document transition as a plain
  // TypeError instead of AbortError. These passive reads are safe to ignore when
  // the browser has already torn down their request.
  return error.name === 'AbortError' ||
    (error instanceof TypeError && error.message === 'Failed to fetch');
}
