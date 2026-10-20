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
    const none = { stage: null, outcome: null };
    const demo = (outcome: 'sale' | 'no_sale' | 'proposal_sent') => ({ stage: 'appointment_demoed' as const, outcome });
    expect(isForwardMove(none, demo('no_sale'))).toBe(true);
    expect(isForwardMove({ stage: 'permit_approved', outcome: null }, { stage: 'site_survey', outcome: null })).toBe(false);
    expect(isForwardMove({ stage: 'site_survey', outcome: null }, none)).toBe(false);
    expect(isForwardMove(demo('sale'), { stage: 'site_survey', outcome: null }, 'sold')).toBe(true);
  });

  it('lets non-admins only move a demo outcome up, never off a sale', () => {
    const demo = (outcome: 'sale' | 'no_sale' | 'proposal_sent') => ({ stage: 'appointment_demoed' as const, outcome });
    expect(isForwardMove(demo('no_sale'), demo('proposal_sent'), 'lost')).toBe(true);
    expect(isForwardMove(demo('proposal_sent'), demo('sale'), 'booked')).toBe(true);
    expect(isForwardMove(demo('proposal_sent'), demo('proposal_sent'), 'booked')).toBe(true);
    expect(isForwardMove(demo('proposal_sent'), demo('no_sale'), 'booked')).toBe(false);
    expect(isForwardMove(demo('sale'), demo('no_sale'), 'sold')).toBe(false);
    expect(isForwardMove(demo('sale'), demo('proposal_sent'), 'sold')).toBe(false);
    // An old status-only sold lead reads as appointment_demoed + sale.
    expect(isForwardMove(readStage({ status: 'sold' }), demo('no_sale'), 'sold')).toBe(false);
    // Sold status wins over a stale stored outcome.
    expect(isForwardMove(demo('proposal_sent'), demo('no_sale'), 'sold')).toBe(false);
  });

  it('writes an old closed lead its stage without a history entry when nothing changes', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(stagePatchForStatus({ status: 'sold' }, 'sold', 'a', now)).toEqual({
      stage: 'appointment_demoed',
      stageOutcome: 'sale',
    });
    expect(stagePatchForStatus({ stage: 'appointment_demoed', stageOutcome: 'proposal_sent' }, 'new', 'a', now)).toEqual({});
  });

  it('a lead lost at pre-qualification (low credit) has no stage: it was never demoed', () => {
    expect(readStage({ status: 'lost', noSaleReason: 'low_credit' })).toEqual({ stage: null, outcome: null });
    expect(readStage({ status: 'lost' })).toEqual({ stage: 'appointment_demoed', outcome: 'no_sale' });
  });
});
