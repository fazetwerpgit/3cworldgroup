import { LEADS_CATEGORIES, LEADS_REASONS } from './formOptions';

export interface LeadsConditions {
  needsHostile: boolean;
  needsBlindKnock: boolean;
  needsLasso: boolean;
  needsNewRep: boolean;
  needsLeadPackCode: boolean;
  needsSpecialRequest: boolean;
}

// Single source of truth for which conditional fields apply, shared by the rep
// page (to show/hide) and the API route (to drop untriggered values). Matches on
// the verbatim option strings so the two sides can never drift.
export function leadsConditions(input: {
  category: string;
  reason: string;
  location: string;
}): LeadsConditions {
  const { category, reason, location } = input;
  const needsHostile = reason === LEADS_REASONS[2];
  const needsBlindKnock = reason === LEADS_REASONS[3] || category === LEADS_CATEGORIES[4];
  const needsLasso = reason === LEADS_REASONS[1];
  const needsNewRep = reason === LEADS_REASONS[0] || category === LEADS_CATEGORIES[0];
  const needsLeadPackCode =
    category === LEADS_CATEGORIES[1] ||
    category === LEADS_CATEGORIES[2] ||
    category === LEADS_CATEGORIES[3];
  const needsSpecialRequest = location === 'Special Request';
  return { needsHostile, needsBlindKnock, needsLasso, needsNewRep, needsLeadPackCode, needsSpecialRequest };
}
