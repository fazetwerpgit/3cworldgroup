import { describe, it, expect } from 'vitest';
import {
  FIBER_COMPANIES,
  EXPEDITE_REASONS,
  PAYROLL_CAMPAIGNS,
  LEADS_CAMPAIGNS,
  LEADS_MANAGERS,
  LEADS_LOCATIONS,
  LEADS_CATEGORIES,
  LEADS_REASONS,
  isValidOption,
} from './formOptions';

describe('form options', () => {
  it('has the exact Fiber companies', () => {
    expect(FIBER_COMPANIES).toEqual(['T-Fiber', 'Verizon', 'AT&T', 'Frontier', 'Spectrum']);
  });
  it('has the exact Expedite reasons', () => {
    expect(EXPEDITE_REASONS).toEqual([
      'Install too far out',
      'Tech missed install need install asap',
      'Customer no showed need it rescheduled asap',
    ]);
  });
  it('has the exact Payroll campaigns', () => {
    expect(PAYROLL_CAMPAIGNS).toEqual([
      'T-Fiber', 'Frontier', 'AT&T', 'Verizon', 'Brightspeed', 'Centurylink/Quantum', 'Ripple',
    ]);
  });
  it('isValidOption accepts members and rejects non-members', () => {
    expect(isValidOption(FIBER_COMPANIES, 'Verizon')).toBe(true);
    expect(isValidOption(FIBER_COMPANIES, 'Comcast')).toBe(false);
  });

  describe('leads request options', () => {
    it('has the exact Leads campaigns', () => {
      expect(LEADS_CAMPAIGNS).toEqual(['T-Fiber', 'Verizon', 'AT&T']);
    });

    it('has the exact Leads managers', () => {
      expect(LEADS_MANAGERS).toEqual(['Jordan Zuber', 'Will Teasdale', 'Jeremy McFarland']);
    });

    it('has the exact Leads locations', () => {
      expect(LEADS_LOCATIONS).toEqual([
        'Des Moines IA', 'St Joeseph MO', 'Iowa City IA', 'Davenport/Moline IA',
        'Rochester MN', 'Geneva IL', 'Grand Rapids MI', 'Lansing MI',
        'Colorado Springs CO', 'Westminster CO', 'Aurora CO',
        'What ever you feel as the best potential to make sales', 'Special Request',
      ]);
    });

    it('has the exact Leads categories', () => {
      expect(LEADS_CATEGORIES).toEqual([
        'New Rep that needs leads and Salesrabbit Logins',
        'Returning pack',
        'Assign new leads and Returning Pack',
        'Road trip ending Returning Pack',
        'Another Rep Blind Knocking territory Assigned to 3C Rep',
      ]);
    });

    it('has the exact Leads reasons', () => {
      expect(LEADS_REASONS).toEqual([
        'New rep neads logins and leads assigned',
        'Terrtory has been worked and knocked multiple times with 2-3 knock dispositions',
        'Hostile situation happened a the territory, requesting switch',
        'another rep was caught knocking in our reps territory',
      ]);
    });
  });
});
