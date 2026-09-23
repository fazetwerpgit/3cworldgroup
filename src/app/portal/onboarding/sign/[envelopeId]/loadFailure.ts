// What the signing page says when the envelope GET fails. The route answers 404
// for an unknown or replaced envelope and 403 for someone else's; neither gets
// better with Retry, so those send the rep back to the checklist instead.

export interface EnvelopeLoadFailure {
  message: string;
  retry: boolean;
}

/** `status` is null when the request never got an answer (no signal). */
export function envelopeLoadFailure(status: number | null): EnvelopeLoadFailure {
  if (status === 403) return { message: 'This document is on another account.', retry: false };
  if (status === 404) {
    return { message: 'This document is no longer available. Your checklist has the current one.', retry: false };
  }
  if (status === null) return { message: "Couldn't load this document. No signal.", retry: true };
  return { message: "Couldn't load this document.", retry: true };
}
