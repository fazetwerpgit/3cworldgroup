// Shared address validation for onboarding intake. Client and server both call
// validateAddress so the rules never diverge. All four fields are optional.

export type AddressFields = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

// Trims every field, caps street/city at 200 chars, validates a non-empty zip
// and state, and returns only the keys that are non-empty (so empty strings are
// never written to Firestore). Empty input is valid (all fields optional).
export function validateAddress(
  input: AddressFields
): { ok: true; clean: AddressFields } | { ok: false; error: string } {
  const address = (input.address ?? '').trim().slice(0, 200);
  const city = (input.city ?? '').trim().slice(0, 200);
  const state = (input.state ?? '').trim().slice(0, 20);
  const zip = (input.zip ?? '').trim().slice(0, 20);

  if (zip && !isValidZip(zip)) {
    return { ok: false, error: 'Enter a valid ZIP code (12345 or 12345-6789)' };
  }
  if (state && !STATE_CODES.has(state)) {
    return { ok: false, error: 'Select a valid state' };
  }

  const clean: AddressFields = {};
  if (address) clean.address = address;
  if (city) clean.city = city;
  if (state) clean.state = state;
  if (zip) clean.zip = zip;
  return { ok: true, clean };
}
