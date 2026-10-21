import { describe, expect, it } from 'vitest';
import { canCloseSolarLead, isSoldLead, isSoldStage } from './closePermission';

describe('canCloseSolarLead', () => {
  it('owners only, for now', () => {
    expect(canCloseSolarLead({ uid: 'o', isOwner: true }, {})).toBe(true);
    expect(canCloseSolarLead({ uid: 'a', isOwner: false }, { status: 'booked' })).toBe(false);
  });
});

describe('isSoldLead', () => {
  it('reads status sold and the sold stages', () => {
    expect(isSoldLead({ status: 'sold' })).toBe(true);
    expect(isSoldLead({ status: 'booked', stage: 'appointment_demoed', stageOutcome: 'sale' })).toBe(true);
    expect(isSoldLead({ status: 'new', stage: 'pto' })).toBe(true);
    expect(isSoldLead({ status: 'booked', stage: 'appointment_demoed', stageOutcome: 'proposal_sent' })).toBe(false);
    expect(isSoldLead({ status: 'lost' })).toBe(false);
    expect(isSoldLead({ status: 'new' })).toBe(false);
  });
});

describe('isSoldStage', () => {
  it('sale and every later stage', () => {
    expect(isSoldStage('appointment_demoed', 'sale')).toBe(true);
    expect(isSoldStage('site_survey', null)).toBe(true);
    expect(isSoldStage('appointment_demoed', 'no_sale')).toBe(false);
    expect(isSoldStage('appointment_demoed', 'proposal_sent')).toBe(false);
    expect(isSoldStage(null, undefined)).toBe(false);
  });
});
