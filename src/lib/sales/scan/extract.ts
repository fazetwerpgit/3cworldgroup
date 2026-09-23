import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { z } from 'zod';
import { INSTALL_DATE_TIME_ZONE } from '@/lib/sales/saleDate';
import { toFormFields, type RawExtraction } from './normalize';
import type { SaleScanFields } from './types';

// Server only. Reads a carrier's order confirmation with Gemini and returns the
// Log Sale form values it could match. Screenshots and what is read off them
// are customer PII: nothing here logs them, and callers must not either.

export const SCAN_MODEL = 'gemini-2.5-flash';
export const SCAN_TIMEOUT_MS = 20_000;

export type ScanImage = { data: Buffer; mimeType: string };

export type ScanFailReason = 'timeout' | 'model_error' | 'bad_response';

export type ScanOutcome = { ok: true; fields: SaleScanFields } | { ok: false; reason: ScanFailReason };

const CONFIDENCE = ['high', 'medium', 'low'];

const field = (description: string): Schema => ({
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING, description },
    confidence: { type: Type.STRING, format: 'enum', enum: CONFIDENCE },
  },
  required: ['value', 'confidence'],
  propertyOrdering: ['value', 'confidence'],
});

export const SCAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    orderNumber: field('Order, confirmation or account number exactly as printed, without its label. If none, the BTN.'),
    customerName: field("Account holder's full name."),
    customerPhone: field("Customer's contact phone number."),
    customerAddress: {
      type: Type.OBJECT,
      description: 'The SERVICE (install) address, not a billing address.',
      properties: {
        street: { type: Type.STRING, description: 'House number and street.' },
        unit: { type: Type.STRING, description: 'Apartment, unit or suite, or empty.' },
        city: { type: Type.STRING },
        state: { type: Type.STRING, description: 'Two-letter state code.' },
        zip: { type: Type.STRING, description: 'ZIP code.' },
        confidence: { type: Type.STRING, format: 'enum', enum: CONFIDENCE },
      },
      required: ['street', 'unit', 'city', 'state', 'zip', 'confidence'],
      propertyOrdering: ['street', 'unit', 'city', 'state', 'zip', 'confidence'],
    },
    carrier: field('Internet provider brand as printed, e.g. "T-Mobile Fiber", "AT&T Fiber", "Frontier", "Xfinity".'),
    planText: field('Internet plan name and speed exactly as printed, e.g. "Fiber 1 Gig" or "Internet 1000". Not the price.'),
    installDate: field('Scheduled install or appointment date as YYYY-MM-DD.'),
    installWindow: field('Install appointment time window as printed, e.g. "8:00 AM - 12:00 PM".'),
  },
  required: [
    'orderNumber',
    'customerName',
    'customerPhone',
    'customerAddress',
    'carrier',
    'planText',
    'installDate',
    'installWindow',
  ],
  propertyOrdering: [
    'orderNumber',
    'customerName',
    'customerPhone',
    'customerAddress',
    'carrier',
    'planText',
    'installDate',
    'installWindow',
  ],
};

const confidence = z.enum(['high', 'medium', 'low']);
const rawField = z.object({ value: z.string().max(500), confidence });

/** The model's answer must be exactly this shape; anything else is a failed read. */
export const rawExtractionSchema = z.object({
  orderNumber: rawField.optional(),
  customerName: rawField.optional(),
  customerPhone: rawField.optional(),
  customerAddress: z
    .object({
      street: z.string().max(200),
      unit: z.string().max(60).optional(),
      city: z.string().max(100),
      state: z.string().max(40),
      zip: z.string().max(20),
      confidence,
    })
    .optional(),
  carrier: rawField.optional(),
  planText: rawField.optional(),
  installDate: rawField.optional(),
  installWindow: rawField.optional(),
}) satisfies z.ZodType<RawExtraction>;

export function scanInstructions(today: string): string {
  return [
    'You read order-confirmation screenshots for home fiber internet sales (T-Mobile Fiber / T-Fiber, AT&T Fiber, Frontier, Xfinity).',
    'All screenshots are from the same order. Copy only what is printed. Never guess, complete or invent a value.',
    'A field that is not shown gets an empty value with confidence "low".',
    'Confidence: "high" = printed and fully legible; "medium" = legible but cut off, blurred, or you had to choose between two candidates; "low" = barely legible or not shown.',
    `Install date: return YYYY-MM-DD. If the year is not printed, use the next such date on or after ${today}, and confidence no higher than "medium".`,
    'Address: the service or install address, split into its parts. Ignore billing and shipping addresses.',
  ].join('\n');
}

/** Today in the zone install dates are kept in, YYYY-MM-DD. */
function todayForInstall(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: INSTALL_DATE_TIME_ZONE }).format(new Date());
}

/** JSON text from the model → form fields, or null when it is not the agreed shape. */
export function parseScanResponse(text: string | undefined): SaleScanFields | null {
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = rawExtractionSchema.safeParse(json);
  return parsed.success ? toFormFields(parsed.data) : null;
}

export async function extractSaleFields(
  images: ScanImage[],
  options: { apiKey: string; timeoutMs?: number; today?: string }
): Promise<ScanOutcome> {
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The abort signal stops the request on our side; the race makes sure the
  // caller gets its answer on time even if the SDK is slow to notice.
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    const ai = new GoogleGenAI({ apiKey: options.apiKey });
    const request = ai.models.generateContent({
      model: SCAN_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Read the order details from ${images.length === 1 ? 'this confirmation screenshot' : `these ${images.length} screenshots of one confirmation`}.`,
            },
            ...images.map((image) => ({
              inlineData: { data: image.data.toString('base64'), mimeType: image.mimeType },
            })),
          ],
        },
      ],
      config: {
        systemInstruction: scanInstructions(options.today ?? todayForInstall()),
        responseMimeType: 'application/json',
        responseSchema: SCAN_RESPONSE_SCHEMA,
        temperature: 0,
        // Transcription, not reasoning: thinking only adds seconds.
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: controller.signal,
      },
    });
    const response = await Promise.race([request, timedOut]);
    if (response === 'timeout') {
      request.catch(() => {});
      return { ok: false, reason: 'timeout' };
    }
    const fields = parseScanResponse(response.text);
    return fields ? { ok: true, fields } : { ok: false, reason: 'bad_response' };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'model_error' };
  } finally {
    clearTimeout(timer);
  }
}
