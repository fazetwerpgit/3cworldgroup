// The rules of one sale entry, shared by the Log Sale form (useSaleFormState)
// and the bulk uploader: the fields, the sale-date inference, validation and
// the create-sale payload. Pure, so both callers follow exactly the same rules.

import type { CreateSaleData, SaleProduct, SaleType } from '@/types';
import { validateHasInternetPlan } from '@/lib/sales/planSelection';
import { hasSaleProof } from '@/lib/sales/proof';
import { proofPathFields } from '@/lib/sales/proofPaths';
import { todaySaleDateInput } from '@/lib/sales/saleDate';

export type SaleFormFields = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  saleType: SaleType;
  saleDate: string;
  installDate: string;
  notes: string;
  orderNumberOrBtn: string;
};

/** Keys that can carry an inline error. `plan` is the plan picker. */
export type SaleFieldKey = 'customerAddress' | 'plan' | 'saleDate' | 'installDate' | 'orderNumberOrBtn';
export type SaleFieldErrors = Partial<Record<SaleFieldKey, string>>;

/** True for a YYYY-MM-DD value on a day earlier than today. */
const isBeforeToday = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value < todaySaleDateInput();

/**
 * The sale date an install date implies while the rep has not set one: an
 * install that already happened dates the sale to it (an install never
 * precedes its sale); a today or future install leaves the sale on today.
 */
export function inferSaleDate(installDate: string): { saleDate: string; fromInstall: boolean } {
  const backdated = isBeforeToday(installDate);
  return { saleDate: backdated ? installDate : todaySaleDateInput(), fromInstall: backdated };
}

export function emptySaleFields(): SaleFormFields {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    saleType: 'new_service' as SaleType,
    saleDate: todaySaleDateInput(),
    installDate: '',
    notes: '',
    orderNumberOrBtn: '',
  };
}

/**
 * Field errors in submit order. Pure so the rules are testable without a DOM.
 */
export function validateSaleForm(input: {
  formData: SaleFormFields;
  products: SaleProduct[];
  proofPaths: string[];
}): SaleFieldErrors {
  const { formData, products, proofPaths } = input;
  const errors: SaleFieldErrors = {};
  const today = todaySaleDateInput();

  if (!formData.customerAddress.trim()) errors.customerAddress = 'Enter the service address';
  // Extras ride alongside an internet plan; ticking one is not a plan pick,
  // except on an Add-On sale (the customer already has internet).
  if (validateHasInternetPlan(products, formData.saleType)) errors.plan = 'Pick a plan';
  if (!formData.saleDate) errors.saleDate = 'Pick the sale date';
  else if (formData.saleDate > today) errors.saleDate = 'Sale date cannot be in the future';
  if (!formData.installDate) errors.installDate = 'Pick the install date';
  // An install can never precede its own sale; catch it here so the rep sees
  // it inline rather than as the server's 400 on submit.
  if (!errors.saleDate && formData.installDate && formData.saleDate > formData.installDate) {
    errors.saleDate = 'Sale date cannot be after the install date';
  }
  if (!hasSaleProof({ orderNumberOrBtn: formData.orderNumberOrBtn, proofScreenshotPaths: proofPaths })) {
    errors.orderNumberOrBtn = 'Enter the order number or BTN, or attach a screenshot';
  }
  return errors;
}

/** The user fields a sale is stamped with (the server re-derives them from the token). */
export type SaleSubmitter = { uid: string; displayName?: string | null; email?: string | null; reportsToId?: string };

/**
 * The create-sale request body for an entry. Shared by the Log Sale form and
 * the bulk uploader so both send exactly the same shape.
 */
export function buildSalePayload(input: {
  formData: SaleFormFields;
  products: SaleProduct[];
  proofPaths: string[];
  user: SaleSubmitter;
  clientSaleId: string;
  allowDuplicate?: boolean;
}): CreateSaleData {
  const { formData, products, proofPaths, user } = input;
  return {
    ...formData,
    ...proofPathFields(proofPaths),
    productSold: products.map((p) => p.productName).join(', '),
    salesRepId: user.uid,
    salesRepName: user.displayName || user.email || '',
    managerId: user.reportsToId,
    products,
    // The server re-prices products from the catalog; these are the preview.
    totalValue: products.reduce((sum, p) => sum + p.totalPrice, 0),
    totalPoints: products.reduce((sum, p) => sum + p.points, 0),
    clientSaleId: input.clientSaleId,
    ...(input.allowDuplicate ? { allowDuplicate: true } : {}),
  };
}
