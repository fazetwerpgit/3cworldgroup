import { signwellProvider } from './signwell';

export type EsignDocKey = 'contract' | 'direct_deposit' | 'pay_structure' | 'fcra_auth' | 'w9';

export interface EnvelopeRequest {
  docKey: EsignDocKey;
  userId: string;
  itemId: string;
  signerName: string;
  signerEmail: string;
  prefill?: Record<string, string>;
}

export interface EnvelopeResult {
  envelopeId: string;
  /** Present when the provider supports in-portal (embedded) signing. Bearer capability — owner-only. */
  embeddedSigningUrl?: string;
}

export interface EsignWebhookEvent {
  envelopeId: string;
  status: 'completed' | 'declined' | 'other';
  metadata: { userId?: string; itemId?: string };
}

export interface EsignProvider {
  id: 'signwell' | 'adobe_sign';
  createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult>;
  /** Downloads the provider's completed, signed PDF. */
  getCompletedPdf(envelopeId: string): Promise<Buffer>;
  /** Fetches a currently-valid embedded signing URL and completion state for an existing envelope. */
  getEmbeddedSigningUrl(envelopeId: string): Promise<{ url?: string; completed: boolean }>;
  /** Returns null when the payload fails signature verification. */
  parseWebhook(rawBody: string, headers: Headers): Promise<EsignWebhookEvent | null>;
}

export function getEsignProvider(): EsignProvider {
  const id = process.env.ESIGN_PROVIDER ?? 'signwell';
  if (id === 'signwell') return signwellProvider;
  if (id === 'adobe_sign') {
    // Adobe Sign pending API-tier confirmation (design open item, 2026-07-08).
    throw new Error('adobe_sign provider not implemented yet; set ESIGN_PROVIDER=signwell');
  }
  throw new Error(`Unknown ESIGN_PROVIDER: ${id}`);
}
