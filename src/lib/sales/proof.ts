import { saleProofPaths } from './proofPaths';

// A sale needs at least one proof: an order number / BTN, or at least one
// uploaded screenshot. Shared by the sale form (client) and the sales API (server).
// The API passes the raw JSON value, so a numeric order number counts and any
// other non-string shape is treated as missing rather than throwing.
export function hasSaleProof(input: {
  orderNumberOrBtn?: string | number | null;
  proofScreenshotPath?: string;
  proofScreenshotPaths?: string[];
}): boolean {
  const order = input.orderNumberOrBtn;
  const hasOrder = typeof order === 'number' ? Number.isFinite(order) : typeof order === 'string' && order.trim() !== '';
  return hasOrder || saleProofPaths(input).length > 0;
}
