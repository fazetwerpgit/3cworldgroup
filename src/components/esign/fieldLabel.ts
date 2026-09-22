/**
 * Builds the label shown above a field on the sign page.
 *
 * Optional fields carry an "(optional)" suffix, but some document definitions
 * already spell it out in their own label. Appending unconditionally printed it
 * twice, so check the incoming label first.
 */
export function fieldLabelWithOptional(label: string, required: boolean): string {
  const text = label.trim();
  if (required) return text;
  if (/\(optional\)$/i.test(text)) return text;
  return `${text} (optional)`;
}

export default fieldLabelWithOptional;
