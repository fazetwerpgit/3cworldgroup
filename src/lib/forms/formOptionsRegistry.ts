import {
  FIBER_COMPANIES,
  EXPEDITE_REASONS,
  PAYROLL_CAMPAIGNS,
  LEADS_CAMPAIGNS,
  LEADS_MANAGERS,
  LEADS_LOCATIONS,
} from './formOptions';
import { SPECIAL_REQUEST_LOCATION } from './leadsPredicates';
import { ENTRY_JOB_POSITION } from './managerInterview';

// Stable keys for every editable form dropdown. Values are the code DEFAULTS;
// admin overrides (in Firestore) supersede these at resolve time.
export const FORM_OPTION_DEFAULTS = {
  providers: FIBER_COMPANIES,
  expediteReasons: EXPEDITE_REASONS,
  payrollCampaigns: PAYROLL_CAMPAIGNS,
  leadsCampaigns: LEADS_CAMPAIGNS,
  leadsManagers: LEADS_MANAGERS,
  leadsLocations: LEADS_LOCATIONS,
  hireManagers: ['Jacob Myers', 'Will Teasdale', 'Jeremy McFarland'],
  hireJobPositions: ['Account Executive', 'L1 Manager', 'L2 Manager'],
  hireMarkets: [] as string[],
} satisfies Record<string, string[]>;

export type OptionKey = keyof typeof FORM_OPTION_DEFAULTS;

export const OPTION_KEYS = Object.keys(FORM_OPTION_DEFAULTS) as OptionKey[];

// All keys above are editable in v1. (Leads categories/reasons are intentionally
// absent — they drive conditional show/hide logic and must stay code-defined.)
export const EDITABLE_OPTION_KEYS: OptionKey[] = [...OPTION_KEYS];

export const FORM_OPTION_LABELS: Record<OptionKey, string> = {
  providers: 'Internet Providers',
  expediteReasons: 'Expedite Reasons',
  payrollCampaigns: 'Payroll Campaigns',
  leadsCampaigns: 'Leads: Campaigns',
  leadsManagers: 'Leads: Managers',
  leadsLocations: 'Leads: Locations',
  hireManagers: 'Hire: Managers',
  hireJobPositions: 'Hire: Job Positions',
  hireMarkets: 'Hire: Markets',
};

// Values the form logic matches by exact text. Removing or renaming one would
// silently change a form, so they can't be removed; each says why.
export const LOCKED_OPTION_VALUES: Partial<Record<OptionKey, Record<string, string>>> = {
  leadsLocations: {
    [SPECIAL_REQUEST_LOCATION]: 'It opens the explanation box on the Leads Request form.',
  },
  hireJobPositions: {
    [ENTRY_JOB_POSITION]: 'It is the one position that skips the promotion questions on the Manager Interview form.',
  },
};

/** The first locked value missing from a list about to be saved, or null. */
export function missingLockedValue(key: OptionKey, values: string[]): string | null {
  return Object.keys(LOCKED_OPTION_VALUES[key] ?? {}).find((locked) => !values.includes(locked)) ?? null;
}

// Pure merge: for each known key, an override (including an empty array) wins;
// otherwise the code default is used. Unknown keys in `overrides` are ignored.
export function mergeOptions(
  overrides: Partial<Record<OptionKey, string[]>>
): Record<OptionKey, string[]> {
  const out = {} as Record<OptionKey, string[]>;
  for (const key of OPTION_KEYS) {
    const o = overrides[key];
    out[key] = Array.isArray(o) ? o : FORM_OPTION_DEFAULTS[key];
  }
  return out;
}
