import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';

// POST /api/portal/ask: kill switch, auth, the daily limit, the prompt (notes
// first, only the asking rep's own dealer code, typed contacts redacted), the
// sandbox stub, and a friendly failure when the provider does not answer.
// fetch is stubbed; nothing leaves the process. Every note is made up.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
let fake: ReturnType<typeof createFakeAskDb>;

function seed() {
  fake = createFakeAskDb({
    knowledgeNotes: {
      n2: { title: 'Second thing', body: 'Do the second thing.', order: 2 },
      n1: { title: 'First thing', body: 'Call the widget desk at 555-010-0199.', order: 1 },
    },
    config: { fiberRepMap: { map: { 'DLR-OWN': 'r1', 'DLR-OTHER': 'r2', 'DLR-THIRD': 'r3' } } },
  });
  state.db = fake.db;
}

function req(fields: { question?: string; history?: unknown; photo?: File }) {
  const form = new FormData();
  if (fields.question !== undefined) form.set('question', fields.question);
  if (fields.history !== undefined) form.set('history', JSON.stringify(fields.history));
  if (fields.photo) form.set('photo', fields.photo);
  return new NextRequest('http://localhost/api/portal/ask', {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: form,
  });
}

function modelAnswers(content = 'Step 1. Check the order screen.') {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content } }],
        usage: { prompt_tokens: 900, completion_tokens: 20, prompt_cache_hit_tokens: 850 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
}

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
const logs = () => [...fake.docs('askLog').values()];

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
  vi.stubEnv('ASK_API_KEY', 'test-key');
  vi.stubEnv('ASK_BASE_URL', '');
  vi.stubEnv('ASK_MODEL', '');
  vi.stubEnv('E2E_SANDBOX', '');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Dana Rep', email: 'dana@x.test', isOwner: false });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/portal/ask', () => {
  it('404s unless ASK_3C_ENABLED is "true" or "owners", before auth or any call', async () => {
    for (const value of ['1', 'TRUE', 'owner', '']) {
      vi.stubEnv('ASK_3C_ENABLED', value);
      expect((await POST(req({ question: 'Hi' }))).status).toBe(404);
    }
    expect(mockUser).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('in "owners" mode answers the owner and 404s everyone else without using a question', async () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    const res = await POST(req({ question: 'Hi' }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askUsage').size).toBe(0);

    mockUser.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner', email: '', isOwner: true });
    modelAnswers();
    expect((await POST(req({ question: 'Hi' }))).status).toBe(200);
  });

  it('passes on the auth failure', async () => {
    mockUser.mockResolvedValueOnce({ ok: false, error: 'Account is not active', status: 403 });
    const res = await POST(req({ question: 'Hi' }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs()).toHaveLength(0);
  });

  it('sends the notes in stable order, then only the asking rep’s own dealer code', async () => {
    modelAnswers();
    const res = await POST(req({ question: 'Where do I start?' }));
    expect(res.status).toBe(200);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
    const body = sentBody();
    expect(body.model).toBe('deepseek-flash');
    const system: string = body.messages[0].content;
    expect(body.messages[0].role).toBe('system');
    expect(system.indexOf('First thing')).toBeLessThan(system.indexOf('Second thing'));
    // The per-rep block comes after every note, so the long prefix is shared.
    expect(system.indexOf('Their dealer code: DLR-OWN')).toBeGreaterThan(system.indexOf('Do the second thing.'));
    expect(system).toContain('First name: Dana');
    expect(system).not.toContain('DLR-OTHER');
    expect(system).not.toContain('DLR-THIRD');
  });

  it("tells the model the code is unknown when the rep isn't mapped", async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'r9', name: 'Pat New', email: '', isOwner: false });
    modelAnswers();
    await POST(req({ question: 'What is my dealer code?' }));
    const system: string = sentBody().messages[0].content;
    expect(system).toContain('Their dealer code: unknown — tell them to ask Jeremy or Jacob');
    expect(system).not.toMatch(/DLR-/);
  });

  it('redacts typed emails and phone numbers from the question and history, in the prompt and the log', async () => {
    modelAnswers();
    const question = 'Order TF-88412907 for jane.doe@example.com, cell (512) 555-0142 or +1 512.555.0199';
    const res = await POST(
      req({
        question,
        history: [
          { role: 'user', text: 'Earlier: 5125550100 and bob@mail.example.org' },
          { role: 'assistant', text: 'Call the widget desk at 555-010-0199.' },
        ],
      })
    );
    const { id, answer } = await res.json();
    const expected = 'Order TF-88412907 for [email], cell [phone] or [phone]';

    const messages = sentBody().messages;
    expect(messages[1]).toEqual({ role: 'user', content: 'Earlier: [phone] and [email]' });
    // Answers are the model's own words from the notes: left as they are.
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Call the widget desk at 555-010-0199.' });
    expect(messages[3]).toEqual({ role: 'user', content: [{ type: 'text', text: expected }] });

    expect(answer).toBe('Step 1. Check the order screen.');
    expect(fake.docs('askLog').get(id)).toMatchObject({
      uid: 'r1',
      repName: 'Dana Rep',
      question: expected,
      // The follow-up's row carries the earlier question, redacted too.
      prevQuestion: 'Earlier: [phone] and [email]',
      hadPhoto: false,
      answer,
      model: 'deepseek-flash',
      promptTokens: 900,
      cachedTokens: 850,
      completionTokens: 20,
      rating: null,
    });
  });

  it('sends a photo as a base64 data URL and never stores it', async () => {
    modelAnswers();
    const photo = new File([Buffer.from('fake-jpeg')], 'IMG_1.jpg', { type: 'image/jpeg' });
    await POST(req({ question: 'What does this mean?', photo }));
    const content = sentBody().messages.at(-1).content;
    expect(content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}` },
    });
    const [logged] = logs();
    expect(logged.hadPhoto).toBe(true);
    expect(logged.prevQuestion).toBeNull();
    expect(JSON.stringify(logged)).not.toContain(Buffer.from('fake-jpeg').toString('base64'));
  });

  it('refuses a photo the model cannot read', async () => {
    const pdf = new File([Buffer.from('%PDF')], 'order.pdf', { type: 'application/pdf' });
    const res = await POST(req({ question: 'Look', photo: pdf }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows 60 questions per rep per Chicago day, then 429s without calling the model', async () => {
    const usageId = `r1_${chicagoDayKey(new Date())}`;
    fake.docs('askUsage').set(usageId, { uid: 'r1', count: 59 });
    modelAnswers();
    expect((await POST(req({ question: 'Number 60' }))).status).toBe(200);
    expect(fake.docs('askUsage').get(usageId)?.count).toBe(60);

    const res = await POST(req({ question: 'Number 61' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/Call Jeremy or Jacob/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Another rep's count is their own.
    mockUser.mockResolvedValue({ ok: true, uid: 'r2', name: 'Other Rep', email: '', isOwner: false });
    modelAnswers();
    expect((await POST(req({ question: 'Mine' }))).status).toBe(200);
  });

  it('answers from a canned stub in the E2E sandbox with no key, echoing the loaded notes', async () => {
    vi.stubEnv('ASK_API_KEY', '');
    vi.stubEnv('E2E_SANDBOX', '1');
    const res = await POST(req({ question: 'Anything' }));
    expect(res.status).toBe(200);
    const { id, answer } = await res.json();
    expect(answer).toContain('Notes loaded (2): First thing, Second thing');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askLog').get(id)?.model).toBe('sandbox-stub');
  });

  it('503s with no key outside the sandbox, without using up a question', async () => {
    vi.stubEnv('ASK_API_KEY', '');
    const res = await POST(req({ question: 'Anything' }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.docs('askUsage').size).toBe(0);
  });

  it('answers a friendly 502 when the provider fails, and logs no exchange', async () => {
    fetchMock.mockResolvedValueOnce(new Response('overloaded', { status: 503 }));
    const res = await POST(req({ question: 'Help' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Ask 3C couldn't answer right now. Try again, or call Jeremy or Jacob.");
    expect(logs()).toHaveLength(0);
  });

  it('answers 504 when the provider times out', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    const res = await POST(req({ question: 'Help' }));
    expect(res.status).toBe(504);
    expect(logs()).toHaveLength(0);
  });

  it('treats an empty model answer as a failure', async () => {
    modelAnswers('   ');
    expect((await POST(req({ question: 'Help' }))).status).toBe(502);
  });
});
