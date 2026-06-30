// Option lists for the rebuilt Formstack rep forms (verbatim values).
export const FIBER_COMPANIES: string[] = ['T-Fiber', 'Verizon', 'AT&T', 'Frontier', 'Spectrum'];

export const EXPEDITE_REASONS: string[] = [
  'Install too far out',
  'Tech missed install need install asap',
  'Customer no showed need it rescheduled asap',
];

export const PAYROLL_CAMPAIGNS: string[] = [
  'T-Fiber',
  'Frontier',
  'AT&T',
  'Verizon',
  'Brightspeed',
  'Centurylink/Quantum',
  'Ripple',
];

export function isValidOption(list: string[], value: string): boolean {
  return list.includes(value);
}
