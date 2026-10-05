/** US phone as "(512) 555-0142"; anything that is not 10 digits is dropped. */
export function formatPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * A stored phone for reading: "(512) 555-0142" when it is a US number,
 * otherwise exactly what was typed, so an odd entry is still shown.
 */
export function displayPhone(raw: string): string {
  return formatPhone(raw) ?? raw.trim();
}

/** A tel: link for a stored phone, keeping only digits and a leading +. */
export function telHref(raw: string): string {
  return `tel:${raw.replace(/[^0-9+]/g, '')}`;
}
