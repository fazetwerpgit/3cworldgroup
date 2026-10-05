export type EsignDocKey = 'contract' | 'direct_deposit' | 'pay_structure' | 'fcra_auth' | 'w9';

export interface EnvelopeRequest {
  docKey: EsignDocKey;
  userId: string;
  itemId: string;
  signerName: string;
  signerEmail: string;
  prefill?: Record<string, string>;
}
