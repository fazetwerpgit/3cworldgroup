// Who may close a solar deal (Jacob, 10/21): for now only owners (Jacob and
// Jeremy) mark a lead sold, and only they change a lead that is already sold.
// Pure, so the stage / status routes and the admin lead sheet share it.
import { isClosedStage, readStage, type SolarDemoOutcome, type SolarLeadStage } from './leadStage';

export const SOLAR_CLOSE_FORBIDDEN = 'Only an owner can mark a solar deal sold or change a sold deal.';

/** The caller as a route gate or the portal user resolves it. */
export interface SolarCloseCaller {
  uid?: string;
  isOwner: boolean;
}

/**
 * Whether a lead reads as sold: status 'sold', or a stage that implies the
 * sale (appointment_demoed + sale, or any later stage). Takes the stored doc or
 * the lead view (both carry status, stage and stageOutcome).
 */
export function isSoldLead(lead: object): boolean {
  const data = lead as Record<string, unknown>;
  if (data.status === 'sold') return true;
  const { stage, outcome } = readStage(data);
  return isClosedStage(stage, outcome);
}

/** Whether a stage choice makes the lead sold. */
export function isSoldStage(stage: SolarLeadStage | null, outcome: SolarDemoOutcome | null | undefined): boolean {
  return isClosedStage(stage, outcome ?? null);
}

/**
 * Whether this caller may mark this lead sold, or change it once it is sold
 * (another sold stage, un-selling, lost, reopen).
 *
 * Today: owners only. Later the consultant / closer the lead is booked with
 * joins them: add `|| caller.uid === <the lead's booking consultantUid>` here
 * (the lead doc carries bookingId; the booking holds consultantUid).
 */
export function canCloseSolarLead(caller: SolarCloseCaller, lead: object): boolean {
  void lead; // The booked-closer rule will read it.
  return caller.isOwner;
}
