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

/**
 * A tel: link for a stored phone. Reps type the phone as free text, so only
 * the first number is dialed: "512-555-0142 ext 12" or "512-555-0142 /
 * 512-555-0199" both dial +1 512-555-0142, never all the digits run together.
 * A US number dials as +1 and ten digits; anything else keeps its digits and
 * a leading +.
 */
export function telHref(raw: string): string {
  const first = raw.match(/\+?\d[\d\s().-]*/)?.[0] ?? '';
  const us = formatPhone(first);
  if (us) return `tel:+1${us.replace(/\D/g, '')}`;
  return `tel:${first.replace(/[^0-9+]/g, '')}`;
}
