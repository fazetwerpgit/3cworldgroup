export type SaleStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type SaleType = 'new_service' | 'upgrade' | 'add_on' | 'renewal';
export type FiberCompany = 'tfiber' | 'att' | 'frontier';

export interface FiberPlan {
  id: string;
  company: FiberCompany;
  name: string;
  speed: string;
  price: number;
  points: number; // Points earned for selling this plan
}

export interface SaleProduct {
  productId: string;
  productName: string;
  company: FiberCompany;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  points: number;
}

export interface CreateSaleData {
  salesRepId: string;
  salesRepName: string;
  managerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress: string; // Required
  saleType: SaleType;
  products: SaleProduct[];
  totalValue: number;
  totalPoints: number;
  notes?: string;
}

export interface Sale {
  id?: string;
  salesRepId: string;
  salesRepName: string;
  managerId?: string;
  territoryId?: string;

  // Customer info
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress: string; // Required

  // Sale details
  saleType: SaleType;
  products: SaleProduct[];
  totalValue: number;
  totalPoints: number;
  commission?: number;

  // Status & workflow
  status: SaleStatus;
  approvedBy?: string;
  approverName?: string;
  approvedAt?: Date;
  rejectionReason?: string;

  // Timestamps
  saleDate: Date;
  createdAt: Date;
  updatedAt: Date;

  notes?: string;
}

export interface SalesStats {
  totalSales: number;
  totalValue: number;
  totalPoints: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  averageSaleValue: number;
  periodStart: Date;
  periodEnd: Date;
}

// Sale type display names
export const SALE_TYPES: { value: SaleType; label: string }[] = [
  { value: 'new_service', label: 'New Service' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'add_on', label: 'Add-On' },
  { value: 'renewal', label: 'Renewal' },
];

// Fiber companies
export const FIBER_COMPANIES: { value: FiberCompany; label: string; logo?: string }[] = [
  { value: 'tfiber', label: 'TFiber (T-Mobile)' },
  { value: 'att', label: 'AT&T Fiber' },
  { value: 'frontier', label: 'Frontier Fiber' },
];

// Fiber plans with pricing (based on 2025 research)
// Points are awarded based on plan tier - scaled 1-15 points
export const FIBER_PLANS: FiberPlan[] = [
  // TFiber (T-Mobile Fiber) Plans
  { id: 'tfiber-500', company: 'tfiber', name: 'TFiber 500', speed: '500 Mbps', price: 60.00, points: 5 },
  { id: 'tfiber-1gig', company: 'tfiber', name: 'TFiber 1 Gig', speed: '1 Gbps', price: 75.00, points: 8 },
  { id: 'tfiber-2gig', company: 'tfiber', name: 'TFiber 2 Gig', speed: '2 Gbps', price: 90.00, points: 10 },

  // AT&T Fiber Plans
  { id: 'att-300', company: 'att', name: 'AT&T Internet 300', speed: '300 Mbps', price: 55.00, points: 3 },
  { id: 'att-500', company: 'att', name: 'AT&T Internet 500', speed: '500 Mbps', price: 65.00, points: 5 },
  { id: 'att-1gig', company: 'att', name: 'AT&T Internet 1000', speed: '1 Gbps', price: 80.00, points: 8 },
  { id: 'att-2gig', company: 'att', name: 'AT&T 2 GIG', speed: '2 Gbps', price: 150.00, points: 12 },
  { id: 'att-5gig', company: 'att', name: 'AT&T 5 GIG', speed: '5 Gbps', price: 225.00, points: 15 },

  // Frontier Fiber Plans
  { id: 'frontier-500', company: 'frontier', name: 'Frontier Fiber 500', speed: '500 Mbps', price: 44.99, points: 4 },
  { id: 'frontier-1gig', company: 'frontier', name: 'Frontier Fiber 1 Gig', speed: '1 Gbps', price: 64.99, points: 7 },
  { id: 'frontier-2gig', company: 'frontier', name: 'Frontier Fiber 2 Gig', speed: '2 Gbps', price: 99.99, points: 10 },
  { id: 'frontier-5gig', company: 'frontier', name: 'Frontier Fiber 5 Gig', speed: '5 Gbps', price: 154.99, points: 15 },
];

// Helper to get plans by company
export function getPlansByCompany(company: FiberCompany): FiberPlan[] {
  return FIBER_PLANS.filter(plan => plan.company === company);
}

// Helper to get plan by ID
export function getPlanById(planId: string): FiberPlan | undefined {
  return FIBER_PLANS.find(plan => plan.id === planId);
}

export const SaleStatusConfig: Record<SaleStatus, { name: string; color: string }> = {
  pending: { name: 'Pending', color: 'yellow' },
  approved: { name: 'Approved', color: 'green' },
  rejected: { name: 'Rejected', color: 'red' },
  cancelled: { name: 'Cancelled', color: 'gray' },
};
