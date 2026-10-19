/**
 * Whether the checklist item now points at a different envelope: a reviewer
 * rejected it (its id went to supersededEnvelopeIds) or a newer one was sent.
 * Such an envelope still says 'sent' but must not approve the item.
 */
export function envelopeSuperseded(item: Record<string, unknown> | undefined, envelopeId: string): boolean {
  if (!item) return false;
  const superseded = item.supersededEnvelopeIds;
  if (Array.isArray(superseded) && superseded.includes(envelopeId)) return true;
  const current = item.esignEnvelopeId;
  return typeof current === 'string' && current !== '' && current !== envelopeId;
}
