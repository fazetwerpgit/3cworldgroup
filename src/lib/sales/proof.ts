// A sale needs at least one proof: an order number / BTN, or an uploaded
// screenshot. Shared by the sale form (client) and the sales API (server).
export function hasSaleProof(input: {
  orderNumberOrBtn?: string;
  proofScreenshotPath?: string;
}): boolean {
  return Boolean(input.orderNumberOrBtn?.trim() || input.proofScreenshotPath?.trim());
}
