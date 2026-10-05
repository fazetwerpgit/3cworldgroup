import { FieldRole } from './auth';

// Recruiting pipeline stages, derived (never stored) from underlying data:
//   processing      - onboarding checklist not fully approved
//   need_logins     - onboarding complete, never signed into the portal
//   cleared_to_sell - signed into the portal, nothing sold yet
//   active          - selling: approved sales, or orders on the carrier report
//   decommissioned  - account deactivated via the decommission flow
export type PipelineStage =
  | 'processing'
  | 'need_logins'
  | 'cleared_to_sell'
  | 'active'
  | 'decommissioned';

export const PipelineStageConfig: Record<
  PipelineStage,
  { name: string; description: string; color: string }
> = {
  processing: {
    name: 'Processing',
    description: 'Working through onboarding paperwork',
    color: 'yellow',
  },
  need_logins: {
    name: 'Need Logins',
    description: "Hasn't signed into the portal yet",
    color: 'blue',
  },
  cleared_to_sell: {
    name: 'Cleared to Sell',
    description: 'Signed into the portal, no sales yet',
    color: 'purple',
  },
  active: {
    name: 'Active',
    description: 'Selling - sales in the portal or on the carrier report',
    color: 'green',
  },
  decommissioned: {
    name: 'Decommissioned',
    description: 'Deactivated',
    color: 'gray',
  },
};

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  'processing',
  'need_logins',
  'cleared_to_sell',
  'active',
  'decommissioned',
];

// Decommission reasons (from the build plan: non-activity / wrongdoing in
// field / manager fire)
export type DecommissionReason = 'non_activity' | 'wrongdoing' | 'manager_fire';

export const DecommissionReasonLabels: Record<DecommissionReason, string> = {
  non_activity: 'Non-Activity',
  wrongdoing: 'Wrongdoing in Field',
  manager_fire: 'Manager Decision',
};

// Audit record stored on the user doc when decommissioned
export interface DecommissionRecord {
  reason: DecommissionReason;
  notes?: string;
  decommissionedBy: string;
  decommissionedByName?: string;
  decommissionedAt: Date;
  /** Status before decommission; Reinstate restores it. Absent on older records. */
  previousStatus?: 'active' | 'pending';
}

// A field rep row in the pipeline dashboard (API response shape)
export interface PipelineRep {
  uid: string;
  displayName: string;
  email: string;
  fieldRole: FieldRole;
  isIBO: boolean;
  reportsToId?: string;
  managerName?: string;
  stage: PipelineStage;
  /** Null for an active rep from before the onboarding checklist existed. */
  onboarding: { approved: number; total: number } | null;
  channelsCleared: number;
  channelsSubmitted: number;
  approvedSales: number;
  /** Orders under this rep's dealer code on the carrier report. */
  carrierOrders: number;
  /** Last time this person signed into the portal (ISO), or null if they never have. */
  lastSignInAt: string | null;
  hireDate?: Date;
  decommission?: DecommissionRecord;
}
