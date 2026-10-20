import { describe, expect, it } from 'vitest';
import {
  isClosedStage,
  isDemoedStage,
  isForwardMove,
  readStage,
  readStageHistory,
  stagePatchForStatus,
  statusForStage,
} from './leadStage';

describe('leadStage', () => {
  it('counts demoed and closed for the leaderboard', () => {
    expect(isDemoedStage(null)).toBe(false);
    expect(isDemoedStage('appointment_demoed')).toBe(true);
    expect(isClosedStage('appointment_demoed', 'sale')).toBe(true);
    expect(isClosedStage('appointment_demoed', 'proposal_sent')).toBe(false);
    expect(isClosedStage('appointment_demoed', 'no_sale')).toBe(false);
    expect(isClosedStage('pto', null)).toBe(true);
    expect(isClosedStage(null, null)).toBe(false);
  });

  it('reads old sold/lost leads as stages, and ignores junk', () => {
    expect(readStage({ status: 'sold' })).toEqual({ stage: 'appointment_demoed', outcome: 'sale' });
    expect(readStage({ status: 'lost' })).toEqual({ stage: 'appointment_demoed', outcome: 'no_sale' });
    expect(readStage({ status: 'booked' })).toEqual({ stage: null, outcome: null });
    expect(readStage({ stage: 'bogus', status: 'new' })).toEqual({ stage: null, outcome: null });
    expect(readStage({ stage: 'site_survey', stageOutcome: 'sale' })).toEqual({ stage: 'site_survey', outcome: null });
    expect(readStageHistory([{ stage: 'pto', at: new Date('2026-10-19T00:00:00Z'), byUid: 'a' }, { stage: 'x' }, 3])).toEqual([
      { stage: 'pto', at: '2026-10-19T00:00:00.000Z', byUid: 'a' },
    ]);
  });

  it('maps stages to status and orders moves', () => {
    expect(statusForStage('appointment_demoed', 'no_sale')).toBe('lost');
    expect(statusForStage('install_complete', null)).toBe('sold');
    expect(statusForStage('appointment_demoed', 'proposal_sent')).toBeNull();
    expect(isForwardMove(null, 'appointment_demoed')).toBe(true);
    expect(isForwardMove('appointment_demoed', 'appointment_demoed')).toBe(true);
    expect(isForwardMove('permit_approved', 'site_survey')).toBe(false);
    expect(isForwardMove('site_survey', null)).toBe(false);
  });

  it('writes an old closed lead its stage without a history entry when nothing changes', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(stagePatchForStatus({ status: 'sold' }, 'sold', 'a', now)).toEqual({
      stage: 'appointment_demoed',
      stageOutcome: 'sale',
    });
    expect(stagePatchForStatus({ stage: 'appointment_demoed', stageOutcome: 'proposal_sent' }, 'new', 'a', now)).toEqual({});
  });
});
