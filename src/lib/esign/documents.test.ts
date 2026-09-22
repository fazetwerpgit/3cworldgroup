import { describe, expect, it } from 'vitest';
import {
  DOCUMENTS,
  ESIGN_CONSENT_TEXT,
  FIELD_LABELS,
  boxToPdfRect,
  isSensitiveFieldKey,
  selectedCheckboxKey,
  validateFields,
} from './documents';

describe('boxToPdfRect', () => {
  it('converts 96dpi top-left px to pt bottom-left', () => {
    expect(boxToPdfRect({ x: 184, y: 584, width: 312, height: 34 }, 792)).toEqual({
      x: 138,
      y: 792 - (584 + 34) * 0.75,
      width: 234,
      height: 25.5,
    });
  });

  it('reads the page height from the caller, so the W-9s odd page size still lands', () => {
    // W-9 pages are 791.968pt tall, not the nominal 792.
    expect(boxToPdfRect({ x: 0, y: 0, width: 10, height: 20 }, 791.968).y).toBeCloseTo(791.968 - 15, 6);
  });
});

describe('DOCUMENTS', () => {
  it('has page counts for all five docs', () => {
    expect(Object.fromEntries(Object.entries(DOCUMENTS).map(([k, v]) => [k, v.pages]))).toEqual({
      contract: 3,
      direct_deposit: 2,
      pay_structure: 1,
      w9: 6,
      fcra_auth: 1,
    });
  });

  it('never places a field beyond the page count', () => {
    for (const config of Object.values(DOCUMENTS)) {
      for (const field of [config.signature, config.date, ...(config.extra ?? [])]) {
        expect(field.page).toBeGreaterThanOrEqual(1);
        expect(field.page).toBeLessThanOrEqual(config.pages);
      }
    }
  });

  it('labels every extra field', () => {
    for (const config of Object.values(DOCUMENTS)) {
      for (const field of config.extra ?? []) {
        expect(FIELD_LABELS[field.key]).toBeTypeOf('string');
      }
    }
  });

  it('uses a unique key per document', () => {
    for (const config of Object.values(DOCUMENTS)) {
      const keys = (config.extra ?? []).map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('selectedCheckboxKey', () => {
  it('maps prefill to checkbox keys', () => {
    expect(selectedCheckboxKey('direct_deposit', { accountType: 'savings' })).toBe('savings');
    expect(selectedCheckboxKey('direct_deposit', { accountType: 'checking' })).toBe('checking');
    expect(selectedCheckboxKey('w9', { taxClassification: 'llc' })).toBe('llc');
    expect(selectedCheckboxKey('w9', { taxClassification: 'individual' })).toBe('individual_sole_prop');
    expect(selectedCheckboxKey('contract', { accountType: 'checking' })).toBeUndefined();
  });

  it('returns undefined for missing or unrecognised choices', () => {
    expect(selectedCheckboxKey('direct_deposit')).toBeUndefined();
    expect(selectedCheckboxKey('direct_deposit', { accountType: 'brokerage' })).toBeUndefined();
    expect(selectedCheckboxKey('w9', {})).toBeUndefined();
  });

  it('names a real checkbox on the document it belongs to', () => {
    for (const [docKey, prefill] of [
      ['direct_deposit', { accountType: 'checking' }],
      ['w9', { taxClassification: 'llc' }],
    ] as const) {
      const key = selectedCheckboxKey(docKey, prefill);
      const field = DOCUMENTS[docKey].extra?.find((f) => f.key === key);
      expect(field?.type).toBe('checkbox');
    }
  });
});

describe('validateFields', () => {
  it('rejects missing required text', () => {
    expect(validateFields('contract', { agent_name: '' })).toMatchObject({ ok: false });
    expect(validateFields('contract', { agent_name: '   ' })).toMatchObject({
      ok: false,
      error: 'Missing required field: Agent name',
    });
  });

  it('rejects a non-object payload', () => {
    expect(validateFields('contract', null)).toMatchObject({ ok: false, error: 'Invalid fields' });
    expect(validateFields('contract', ['agent_name'])).toMatchObject({ ok: false, error: 'Invalid fields' });
  });

  it('drops unknown keys and coerces types', () => {
    const r = validateFields('direct_deposit', {
      legal_name: ' A ',
      bank_name: 'B',
      routing_number: '1',
      account_number: '2',
      checking: true,
      bogus: 'x',
    });
    expect(r).toEqual({
      ok: true,
      fields: { legal_name: 'A', bank_name: 'B', routing_number: '1', account_number: '2', checking: true },
    });
  });

  it('caps text at 200 characters', () => {
    const r = validateFields('contract', {
      agent_name: 'a'.repeat(500),
      street_address: 'st',
      city_state_zip: 'cz',
      cell_phone: '555',
      email: 'e@x.com',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && (r.fields.agent_name as string).length).toBe(200);
  });

  it('treats a non-true checkbox value as unchecked', () => {
    const r = validateFields('direct_deposit', {
      legal_name: 'A',
      bank_name: 'B',
      routing_number: '1',
      account_number: '2',
      checking: 'yes',
      savings: true,
    });
    expect(r).toMatchObject({ ok: true, fields: { checking: false, savings: true } });
  });

  it('requires exactly one of checking or savings', () => {
    const base = { legal_name: 'A', bank_name: 'B', routing_number: '1', account_number: '2' };
    expect(validateFields('direct_deposit', base)).toMatchObject({
      ok: false,
      error: 'Choose checking or savings',
    });
    expect(validateFields('direct_deposit', { ...base, checking: true, savings: true })).toMatchObject({
      ok: false,
      error: 'Choose checking or savings',
    });
  });

  it('requires one TIN and one classification on w9', () => {
    const base = { name: 'N', address: 'A', city_state_zip: 'C', individual_sole_prop: true };
    expect(validateFields('w9', base)).toMatchObject({ ok: false, error: 'Provide either an SSN or an EIN' });
    expect(validateFields('w9', { ...base, ssn: '1', ein: '2' })).toMatchObject({ ok: false });
    expect(validateFields('w9', { ...base, ssn: '1' })).toMatchObject({ ok: true });
    expect(validateFields('w9', { ...base, ein: '2' })).toMatchObject({ ok: true });
  });

  it('requires exactly one w9 tax classification', () => {
    const base = { name: 'N', address: 'A', city_state_zip: 'C', ssn: '1' };
    expect(validateFields('w9', base)).toMatchObject({ ok: false, error: 'Choose a tax classification' });
    expect(validateFields('w9', { ...base, individual_sole_prop: true, llc: true })).toMatchObject({
      ok: false,
      error: 'Choose a tax classification',
    });
  });

  it('returns empty fields for docs without extras', () => {
    expect(validateFields('fcra_auth', {})).toEqual({ ok: true, fields: {} });
    expect(validateFields('pay_structure', { anything: 'ignored' })).toEqual({ ok: true, fields: {} });
  });
});

describe('sensitive keys', () => {
  it('knows sensitive keys', () => {
    expect(isSensitiveFieldKey('ssn')).toBe(true);
    expect(isSensitiveFieldKey('name')).toBe(false);
  });

  it('covers every money or tax identifier in the documents', () => {
    for (const key of ['ssn', 'ein', 'routing_number', 'account_number']) {
      expect(isSensitiveFieldKey(key)).toBe(true);
    }
  });
});

describe('ESIGN_CONSENT_TEXT', () => {
  it('is the exact approved wording', () => {
    expect(ESIGN_CONSENT_TEXT).toBe(
      'I agree that my electronic signature is the legal equivalent of my handwritten signature, and I consent to sign and receive this document electronically.'
    );
  });
});
