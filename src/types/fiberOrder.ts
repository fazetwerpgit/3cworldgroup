// Fiber install-status orders, ingested from the daily provider report email
// (xlsx attachment via Postmark inbound webhook). This data is display-only
// "peace of mind" for reps: it NEVER feeds the leaderboard, commissions,
// comp plans, or any Sale records.

export type FiberOrderStatus =
  | 'pending_install' // Account Status: Pending Installation
  | 'active'          // Account Status: Active
  | 'pre_sale'        // No Installation Scheduled / Pre-Sale to Schedule sheet
  | 'cancelled'       // Cancelled Order / Unconfirmed to Cancelled sheet
  | 'churned'         // Account Status: Churned
  | 'breakage';       // Customer Driven Breakage sheet (missed/rescheduled/cancel-at-door)

export interface FiberOrder {
  // Firestore doc id: Alt Order ID (e.g. TMO20260824UZMTV) for order rows,
  // or 'brk_<sha1(address|installDate)>' for breakage rows (that sheet has no order id).
  id: string;
  status: FiberOrderStatus;
  // Raw status string from the sheet, shown as-is when it doesn't map cleanly.
  rawStatus: string;
  repDealerId: string;      // e.g. '4721016' — stable per rep across reports
  repName: string;          // dealername as printed in the report
  matchedUserId: string | null; // portal users/{uid} matched by dealer id or normalized displayName
  orderDate: string | null;       // ISO yyyy-mm-dd (converted from Excel serials)
  estInstallDate: string | null;
  activationDate: string | null;
  cancellationDate: string | null;
  deactivationDate: string | null;
  fiberPlan: string | null;
  mrc: number | null;
  address: string;          // street address
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  // Breakage-only detail
  breakageReason: string | null; // TMO_REASON + REASON_CODE, e.g. 'CX Missed — Customer Not Home'
  breakageNotes: string | null;
  customerName: string | null;   // breakage sheet only; other sheets carry no customer name
  sourceSheet: string;      // which tab of the workbook the row came from
  reportReceivedAt: string; // ISO timestamp of the email that last touched this doc
  updatedAt: string;
  // Attached at read time only (never stored): customer name from a portal Sale
  // the matched rep logged THEMSELVES, cross-matched by street address.
  loggedCustomerName?: string | null;
}

// Import log entry, one per received report email (collection: fiberReportImports).
export interface FiberReportImport {
  receivedAt: string;
  filename: string;
  fromEmail: string;
  subject: string;
  rowCounts: Record<string, number>; // per sheet
  upserted: number;
  matchedReps: number;
  unmatchedRepNames: string[];
  error: string | null;
}

export interface FiberStatusResponse {
  scope: 'own' | 'all';
  lastReportAt: string | null;
  orders: FiberOrder[];
  // Admin scope only: orders whose rep didn't match any portal user.
  unmatched?: FiberOrder[];
  // Own scope only: how many sales this rep has logged in the portal themselves.
  submittedTotal?: number;
}
