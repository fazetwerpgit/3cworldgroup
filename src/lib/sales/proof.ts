import { saleProofPaths } from './proofPaths';

// A sale needs at least one proof: an order number / BTN, or at least one
// uploaded screenshot. Shared by the sale form (client) and the sales API (server).
export function hasSaleProof(input: {
  orderNumberOrBtn?: string;
  proofScreenshotPath?: string;
  proofScreenshotPaths?: string[];
}): boolean {
  return Boolean(input.orderNumberOrBtn?.trim()) || saleProofPaths(input).length > 0;
}
