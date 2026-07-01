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

export const LEADS_CAMPAIGNS: string[] = ['T-Fiber', 'Verizon', 'AT&T'];

export const LEADS_MANAGERS: string[] = ['Jordan Zuber', 'Will Teasdale', 'Jeremy McFarland'];

export const LEADS_LOCATIONS: string[] = [
  'Des Moines IA', 'St Joeseph MO', 'Iowa City IA', 'Davenport/Moline IA',
  'Rochester MN', 'Geneva IL', 'Grand Rapids MI', 'Lansing MI',
  'Colorado Springs CO', 'Westminster CO', 'Aurora CO',
  'What ever you feel as the best potential to make sales', 'Special Request',
];

export const LEADS_CATEGORIES: string[] = [
  'New Rep that needs leads and Salesrabbit Logins',
  'Returning pack',
  'Assign new leads and Returning Pack',
  'Road trip ending Returning Pack',
  'Another Rep Blind Knocking territory Assigned to 3C Rep',
];

export const LEADS_REASONS: string[] = [
  'New rep neads logins and leads assigned',
  'Terrtory has been worked and knocked multiple times with 2-3 knock dispositions',
  'Hostile situation happened a the territory, requesting switch',
  'another rep was caught knocking in our reps territory',
];
