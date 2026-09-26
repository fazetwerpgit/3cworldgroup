// Design-lab sample data (fake rep, fake customers). Dev-only; never shipped.
export const rep = {
  firstName: 'Devon',
  name: 'Devon Price',
  initials: 'DP',
  title: 'Account Executive',
};

// Reps are paid ~14 days after install.
export const payPeriod = {
  estimatedPay: 1240,
  nextPayday: 'Fri, Oct 3',
  nextPaydayAmount: 520,
  installedCount: 6,
  scheduledCount: 3,
  needsDateCount: 1,
  vsLastPeriodPct: 18,
};

export const standing = {
  period: 'This week',
  rank: 4,
  of: 18,
  points: 11,
  pointsBehindNext: 3,
  nextName: 'Braeden C.',
};

export const challenge = { label: 'Close 10 sales by Sunday', done: 6, goal: 10, timeLeft: '4d 8h left' };

export const today = [
  { time: '10:00 AM', title: 'Team Call — Beginning of Week', kind: 'call' as const },
  { time: 'Now', title: '1 sale needs an install date', kind: 'action' as const },
];

export type SaleStatus = 'installed' | 'scheduled' | 'needs-date' | 'cancelled';
export const recentSales = [
  { customer: 'Martinez', address: '1418 Oak Ridge Dr', plan: 'TFiber 1 Gig', provider: 'TFiber', status: 'installed' as SaleStatus, installDate: 'Sep 19', estPay: 130, payDate: 'Oct 3' },
  { customer: 'Nguyen', address: '22 W Harrison St', plan: 'AT&T Fiber 500', provider: 'AT&T', status: 'scheduled' as SaleStatus, installDate: 'Sep 25', estPay: 110, payDate: 'Oct 9' },
  { customer: 'Okafor', address: '905 Linden Ave', plan: 'Frontier 2 Gig', provider: 'Frontier', status: 'needs-date' as SaleStatus, installDate: null, estPay: 150, payDate: null },
  { customer: 'Brooks', address: '71 Cedar Ct', plan: 'TFiber 500', provider: 'TFiber', status: 'installed' as SaleStatus, installDate: 'Sep 16', estPay: 120, payDate: 'Sep 30' },
  { customer: 'Hale', address: '310 Birch Ln', plan: 'Xfinity 1 Gig', provider: 'Xfinity', status: 'cancelled' as SaleStatus, installDate: null, estPay: 0, payDate: null },
];

export const providers = ['TFiber', 'AT&T Fiber', 'Frontier', 'Xfinity'];

// What the AI screenshot reader would return for a carrier confirmation (mocked).
export const scanResult = {
  provider: { value: 'TFiber', confidence: 'high' as const },
  orderNumber: { value: 'TMF-48213907', confidence: 'high' as const },
  customerName: { value: 'Alicia Martinez', confidence: 'high' as const },
  phone: { value: '(515) 555-0148', confidence: 'medium' as const },
  address: { value: '1418 Oak Ridge Dr, Ankeny, IA 50023', confidence: 'high' as const },
  plan: { value: 'TFiber 1 Gig', confidence: 'high' as const },
  installDate: { value: 'Sep 26', confidence: 'low' as const },
};
