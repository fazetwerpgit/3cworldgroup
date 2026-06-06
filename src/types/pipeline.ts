import { FieldRole } from './auth';

// Recruiting pipeline stages, derived (never stored) from underlying data:
//   processing      - onboarding checklist not fully approved
//   need_logins     - onboarding complete, no sales channel cleared yet
//   cleared_to_sell - at least one channel cleared, no approved sales yet
//   active          - has at least one approved sale
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
    description: 'Onboarding done - awaiting channel credentials',
    color: 'blue',
  },
  cleared_to_sell: {
    name: 'Cleared to Sell',
    description: 'Credentialed on at least one channel',
    color: 'purple',
  },
  active: {
    name: 'Active',
    description: 'Selling - has approved sales',
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
  onboarding: { approved: number; total: number };
  channelsCleared: number;
  channelsSubmitted: number;
  approvedSales: number;
  hireDate?: Date;
  decommission?: DecommissionRecord;
}
