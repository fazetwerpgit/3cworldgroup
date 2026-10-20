import { describe, expect, it } from 'vitest';
import { leadMilestones } from './leadMilestones';
import { leadEvents } from './leaderboard';
import { stagePatchForStatus } from './leadStage';

const d = (iso: string) => new Date(iso);

describe('leadMilestones', () => {
  it('a lead not yet demoed has no milestones', () => {
    expect(leadMilestones({ status: 'new' })).toEqual({ demoedAt: null, outcome: null, closedAt: null });
    expect(leadMilestones({ status: 'booked', updatedAt: d('2026-10-01') })).toEqual({ demoedAt: null, outcome: null, closedAt: null });
    expect(leadMilestones({ stage: 'something_else', updatedAt: d('2026-10-01') }).demoedAt).toBeNull();
  });

  it('old sold/lost: demoed (sale / no_sale) at statusChangedAt, else updatedAt', () => {
    expect(leadMilestones({ status: 'sold', statusChangedAt: d('2026-10-02'), updatedAt: d('2026-10-09') })).toEqual({
      demoedAt: d('2026-10-02'), outcome: 'sale', closedAt: d('2026-10-02'),
    });
    expect(leadMilestones({ status: 'lost', updatedAt: d('2026-10-09') })).toEqual({
      demoedAt: d('2026-10-09'), outcome: 'no_sale', closedAt: null,
    });
  });

  it('dates demoed and closed by stageHistory, not updatedAt', () => {
    const m = leadMilestones({
      stage: 'appointment_demoed',
      stageOutcome: 'sale',
      updatedAt: d('2026-10-20'),
      stageHistory: [
        { stage: 'appointment_demoed', outcome: 'proposal_sent', at: d('2026-10-03') },
        { stage: 'appointment_demoed', outcome: 'sale', at: d('2026-10-08') },
      ],
    });
    expect(m).toEqual({ demoedAt: d('2026-10-03'), outcome: 'sale', closedAt: d('2026-10-08') });
  });

  it('a later stage implies the demo and the sale', () => {
    const m = leadMilestones({
      stage: 'permit_approved',
      stageHistory: [
        { stage: 'appointment_demoed', outcome: 'sale', at: d('2026-10-04') },
        { stage: 'site_survey', at: d('2026-10-06') },
        { stage: 'permit_approved', at: d('2026-10-10') },
      ],
    });
    expect(m).toEqual({ demoedAt: d('2026-10-04'), outcome: 'sale', closedAt: d('2026-10-04') });
  });

  it('a stage with no dated history falls back to updatedAt', () => {
    expect(leadMilestones({ stage: 'appointment_demoed', stageOutcome: 'no_sale', updatedAt: d('2026-10-05') })).toEqual({
      demoedAt: d('2026-10-05'), outcome: 'no_sale', closedAt: null,
    });
    expect(leadMilestones({ stage: 'install_complete', updatedAt: '2026-10-05T00:00:00Z' })).toEqual({
      demoedAt: d('2026-10-05'), outcome: 'sale', closedAt: d('2026-10-05'),
    });
  });

  it('a sale walked back to no_sale leaves Closed (still Demoed)', () => {
    const m = leadMilestones({
      stage: 'appointment_demoed',
      stageHistory: [
        { stage: 'appointment_demoed', outcome: 'sale', at: d('2026-10-03') },
        { stage: 'appointment_demoed', outcome: 'no_sale', at: d('2026-10-05') },
      ],
    });
    expect(m).toEqual({ demoedAt: d('2026-10-03'), outcome: 'no_sale', closedAt: null });
  });

  it('reads what the stage API writes (stageOutcome, ISO history dates)', () => {
    const data = {
      status: 'sold',
      updatedAt: d('2026-10-20'),
      ...stagePatchForStatus({ status: 'booked' }, 'sold', 'admin', d('2026-10-07T15:00:00Z')),
    };
    expect(leadMilestones(data)).toEqual({
      demoedAt: d('2026-10-07T15:00:00Z'), outcome: 'sale', closedAt: d('2026-10-07T15:00:00Z'),
    });
  });

  it('with no history, stageChangedAt beats updatedAt', () => {
    expect(
      leadMilestones({ stage: 'site_survey', stageChangedAt: d('2026-10-04'), updatedAt: d('2026-10-12') })
    ).toEqual({ demoedAt: d('2026-10-04'), outcome: 'sale', closedAt: d('2026-10-04') });
  });

  it('ignores junk history entries', () => {
    const m = leadMilestones({ stage: 'appointment_demoed', stageHistory: [null, 'x', { stage: 'appointment_demoed', at: 'bad' }] });
    expect(m.demoedAt).toBeNull();
  });
});

describe('leadEvents', () => {
  const names = new Map([['ana', 'Ana Rivera']]);
  const leads = [
    { id: 'L1', data: { repUid: 'ana', repName: 'Old Name', status: 'sold', statusChangedAt: d('2026-10-02') } },
    { id: 'L2', data: { repUid: 'ben', repName: 'Ben Cole', status: 'lost', statusChangedAt: d('2026-10-03') } },
    { id: 'L3', data: { status: 'sold', statusChangedAt: d('2026-10-03') } },
    { id: 'L4', data: { repUid: 'ana', status: 'demo', stage: 'appointment_demoed', updatedAt: d('2026-10-03') } },
  ];

  it('credits the setter (the lead rep), by name from users, skipping no-rep and demo leads', () => {
    expect(leadEvents(leads, 'demoed', names, leadMilestones)).toEqual([
      { repUid: 'ana', repName: 'Ana Rivera', at: d('2026-10-02'), kind: 'Sale' },
      { repUid: 'ben', repName: 'Ben Cole', at: d('2026-10-03'), kind: 'No sale' },
    ]);
  });

  it('closed counts sales only', () => {
    expect(leadEvents(leads, 'closed', names, leadMilestones)).toEqual([
      { repUid: 'ana', repName: 'Ana Rivera', at: d('2026-10-02'), kind: 'Sale' },
    ]);
  });
});
