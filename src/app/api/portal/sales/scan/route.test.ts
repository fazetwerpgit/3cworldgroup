import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// POST /api/portal/sales/scan: the gate (kill switch, auth, own paths only),
// then a quiet { fields: null } for any bad read, and carrier/plan matched in
// code. The Gemini SDK and Storage are mocked; nothing leaves the process.

const generateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(function GoogleGenAI() {
      return { models: { generateContent } };
    }),
  };
});

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

const download = vi.fn(async () => [Buffer.from('fake-image')]);
const getFiles = vi.fn(async () => [
  [{ metadata: { contentType: 'image/jpeg', size: 1000 }, download }],
]);
vi.mock('@/lib/firebase/admin', () => ({
  getOnboardingBucket: () => ({ getFiles }),
}));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { scanLimiter } from '@/lib/sales/scan/limiter';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const OWN = 'form-attachments/r1/sale-proof/abc_000001/';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/sales/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

const f = (value: string, confidence = 'high') => ({ value, confidence });

function modelSays(json: unknown) {
  generateContent.mockResolvedValueOnce({ text: typeof json === 'string' ? json : JSON.stringify(json) });
}

const GOOD = {
  orderNumber: f('Order # TF-88412907'),
  customerName: f('Dana Whitfield'),
  customerPhone: f('1 (512) 555-0142', 'medium'),
  customerAddress: { street: '4812 Larkspur Ln', unit: 'Apt 3', city: 'Austin', state: 'tx', zip: '78745', confidence: 'high' },
  carrier: f('T-Mobile Fiber'),
  planText: f('Fiber 1 Gig'),
  installDate: f('2026-10-02', 'low'),
  installWindow: f('8:00 AM - 12:00 PM'),
};

beforeEach(() => {
  vi.stubEnv('SALE_SCAN_ENABLED', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Rep', email: 'r@x.com' });
  generateContent.mockReset();
  getFiles.mockClear();
  download.mockClear();
  scanLimiter.reset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/portal/sales/scan', () => {
  it('404s unless SALE_SCAN_ENABLED is exactly "true"', async () => {
    vi.stubEnv('SALE_SCAN_ENABLED', '1');
    const res = await POST(req({ paths: [OWN] }));
    expect(res.status).toBe(404);
    expect(mockUser).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('passes on the auth failure', async () => {
    mockUser.mockResolvedValueOnce({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req({ paths: [OWN] }));
    expect(res.status).toBe(401);
    expect(getFiles).not.toHaveBeenCalled();
  });

  it("403s on another rep's path, or one that climbs out of its own", async () => {
    for (const paths of [
      ['form-attachments/r2/sale-proof/abc_000001/'],
      [OWN, 'form-attachments/r2/sale-proof/x_000002/'],
      ['form-attachments/r1/../r2/sale-proof/x/'],
      ['form-attachments/r1x/sale-proof/x/'],
    ]) {
      const res = await POST(req({ paths }));
      expect(res.status).toBe(403);
    }
    expect(getFiles).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('400s on a missing, empty or oversized path list', async () => {
    for (const body of [{}, { paths: [] }, { paths: [OWN, OWN, OWN, OWN, OWN] }, { paths: [42] }]) {
      expect((await POST(req(body))).status).toBe(400);
    }
  });

  it('maps a good read to form fields, carrier and plan matched in code', async () => {
    modelSays(GOOD);
    const res = await POST(req({ paths: [OWN] }));
    expect(res.status).toBe(200);
    const { fields } = await res.json();
    expect(fields).toEqual({
      orderNumberOrBtn: { value: 'TF-88412907', confidence: 'high' },
      customerName: { value: 'Dana Whitfield', confidence: 'high' },
      customerPhone: { value: '(512) 555-0142', confidence: 'medium' },
      customerAddress: { value: '4812 Larkspur Ln Apt 3, Austin, TX 78745', confidence: 'high' },
      installDate: { value: '2026-10-02', confidence: 'low' },
      installWindow: { value: '8:00 AM - 12:00 PM', confidence: 'high' },
      provider: { value: 'tfiber', confidence: 'high' },
      plan: { value: 'tfiber-1gig', confidence: 'high' },
    });
    // The images went inline, from the caller's own folder.
    expect(getFiles).toHaveBeenCalledWith({ prefix: OWN, delimiter: '/' });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe('gemini-2.5-flash');
    expect(call.contents[0].parts[1].inlineData).toEqual({
      data: Buffer.from('fake-image').toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(call.config.responseMimeType).toBe('application/json');
  });

  it('leaves the plan empty when the speed has no single catalog match', async () => {
    modelSays({ ...GOOD, carrier: f('AT&T Fiber', 'medium'), planText: f('Internet 1000') });
    let { fields } = await (await POST(req({ paths: [OWN] }))).json();
    expect(fields.provider).toEqual({ value: 'att', confidence: 'medium' });
    expect(fields.plan).toEqual({ value: 'att-1gig', confidence: 'medium' });

    modelSays({ ...GOOD, carrier: f('Frontier'), planText: f('Fiber 300') });
    ({ fields } = await (await POST(req({ paths: [OWN] }))).json());
    expect(fields.provider.value).toBe('frontier');
    expect(fields.plan).toBeUndefined();

    modelSays({ ...GOOD, carrier: f('Starlink'), planText: f('Residential') });
    ({ fields } = await (await POST(req({ paths: [OWN] }))).json());
    expect(fields.provider).toBeUndefined();
    expect(fields.plan).toBeUndefined();
  });

  it('answers fields:null, 200, for malformed or wrong-shaped model output', async () => {
    for (const bad of ['not json {', JSON.stringify({ orderNumber: { value: 12, confidence: 'sure' } }), '']) {
      modelSays(bad);
      const res = await POST(req({ paths: [OWN] }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.fields).toBeNull();
      expect(body.reason).toBe('bad_response');
    }
  });

  it('answers fields:null when the model call throws', async () => {
    generateContent.mockRejectedValueOnce(new Error('503'));
    const body = await (await POST(req({ paths: [OWN] }))).json();
    expect(body).toEqual({ fields: null, reason: 'model_error' });
  });

  it('drops values that are not what the field takes', async () => {
    modelSays({
      ...GOOD,
      orderNumber: f('Pending'),
      customerPhone: f('555-01'),
      installDate: f('2026-02-31'),
      customerAddress: { street: '', city: 'Austin', state: 'TX', zip: '78745', confidence: 'low' },
    });
    const { fields } = await (await POST(req({ paths: [OWN] }))).json();
    expect(fields.orderNumberOrBtn).toBeUndefined();
    expect(fields.customerPhone).toBeUndefined();
    expect(fields.installDate).toBeUndefined();
    expect(fields.customerAddress).toBeUndefined();
    expect(fields.customerName.value).toBe('Dana Whitfield');
  });

  it('answers fields:null when no proof file can be read', async () => {
    getFiles.mockResolvedValueOnce([[]]);
    const body = await (await POST(req({ paths: [OWN] }))).json();
    expect(body).toEqual({ fields: null, reason: 'no_images' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rate-limits each rep to 20 scans per 10 minutes', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(GOOD) });
    for (let i = 0; i < 20; i++) expect((await (await POST(req({ paths: [OWN] }))).json()).fields).not.toBeNull();
    const body = await (await POST(req({ paths: [OWN] }))).json();
    expect(body).toEqual({ fields: null, reason: 'rate_limited' });
    expect(generateContent).toHaveBeenCalledTimes(20);
  });

  it('never logs what it read', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    modelSays(GOOD);
    await POST(req({ paths: [OWN] }));
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/Whitfield|Larkspur|555|TF-884|fake-image|ZmFrZS1pbWFnZQ/);
    expect(logged).toContain('"outcome":"ok"');
  });
});
