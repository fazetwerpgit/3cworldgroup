'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import f from '@/components/portal/rep/rep-forms.module.css';
import type { EnvelopeFieldView, EnvelopeView } from '@/lib/esign/envelopeView';
import { ESIGN_CONSENT_TEXT, fieldFormatError } from '@/lib/esign/documents';
import { fieldLabelWithOptional } from './fieldLabel';
import d from './document-fields.module.css';

export type FieldValues = Record<string, string | boolean>;

/**
 * The server's one-of rules, mirrored here only so a Sign button can say what
 * is missing before the round trip. `validateFields` on the server stays the
 * authority; this never lets anything through that it would reject.
 * `none` shows while nothing is filled, `many` while more than one is.
 */
const ONE_OF_RULES: Record<string, { keys: string[]; none: string; many: string; label?: string }[]> = {
  w9: [
    {
      keys: ['ssn', 'ein'],
      none: 'Enter your SSN or EIN.',
      many: 'Enter either an SSN or an EIN, not both.',
      // Each box alone is optional, but one of them is not: say so on both.
      label: 'SSN or EIN required',
    },
    {
      keys: ['individual_sole_prop', 'llc'],
      none: 'Choose a tax classification.',
      many: 'Choose one tax classification.',
    },
  ],
  direct_deposit: [{ keys: ['checking', 'savings'], none: 'Choose checking or savings.', many: 'Choose checking or savings, not both.' }],
};

type FieldInputProps = Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'autoComplete' | 'autoCapitalize' | 'autoCorrect' | 'spellCheck'
>;

/** Numbers never go into autofill, autocorrect or the suggestion bar. */
const PRIVATE_NUMBER: FieldInputProps = {
  inputMode: 'numeric',
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
};
const PERSON_NAME: FieldInputProps = { autoComplete: 'name', autoCapitalize: 'words', autoCorrect: 'off', spellCheck: false };
const STREET: FieldInputProps = { autoComplete: 'address-line1', autoCapitalize: 'words', autoCorrect: 'off' };

/**
 * The phone keyboard and autofill for each document field. Fields not listed
 * take a plain sentence-case text box with autofill off.
 */
const FIELD_INPUT: Record<string, FieldInputProps> = {
  ssn: PRIVATE_NUMBER,
  ein: PRIVATE_NUMBER,
  routing_number: PRIVATE_NUMBER,
  account_number: PRIVATE_NUMBER,
  cell_phone: { type: 'tel', autoComplete: 'mobile tel' },
  office_phone: { type: 'tel', autoComplete: 'work tel' },
  email: { type: 'email', autoComplete: 'email', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false },
  website: { type: 'url', autoComplete: 'url', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false },
  name: PERSON_NAME,
  legal_name: PERSON_NAME,
  agent_name: PERSON_NAME,
  business_name: { autoComplete: 'organization', autoCapitalize: 'words', autoCorrect: 'off' },
  bank_name: { autoComplete: 'off', autoCapitalize: 'words', autoCorrect: 'off' },
  street_address: STREET,
  address: STREET,
  city_state_zip: { autoComplete: 'off', autoCapitalize: 'words', autoCorrect: 'off' },
  llc_classification: { autoComplete: 'off', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false },
  deposit_amount: { inputMode: 'decimal', autoComplete: 'off' },
};

function isFilled(value: string | boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : String(value ?? '').trim().length > 0;
}

/** The starting values for a document's form: whatever the envelope prefilled. */
export function initialFieldValues(envelope: EnvelopeView): FieldValues {
  return Object.fromEntries(envelope.fields.map((field) => [field.key, field.value]));
}

/** The first thing this document still needs from the rep, or null when its fields are complete. */
export function fieldsBlocker(envelope: EnvelopeView, values: FieldValues): string | null {
  for (const field of envelope.fields) {
    if (field.type === 'text' && field.required && !isFilled(values[field.key])) {
      return `Fill in ${field.label.toLowerCase()}.`;
    }
  }
  for (const field of envelope.fields) {
    const formatError = fieldFormatError(envelope.docKey, field.key, String(values[field.key] ?? ''));
    if (field.type === 'text' && formatError) return `${formatError}.`;
  }
  for (const rule of ONE_OF_RULES[envelope.docKey] ?? []) {
    const filled = rule.keys.filter((key) => isFilled(values[key])).length;
    if (filled === 0) return rule.none;
    if (filled > 1) return rule.many;
  }
  return null;
}

interface DocumentFieldsProps {
  envelope: EnvelopeView;
  values: FieldValues;
  /** Prefilled fields the rep has chosen to edit. */
  unlocked: Record<string, boolean>;
  onChange: (key: string, value: string | boolean) => void;
  onUnlock: (key: string) => void;
  /** Keeps input ids unique when several documents are on one page. */
  idPrefix?: string;
}

/** A document's fill-in fields: text boxes in the form grid, then checkbox rows. */
export function DocumentFields({ envelope, values, unlocked, onChange, onUnlock, idPrefix = 'esign' }: DocumentFieldsProps) {
  // Fields the rep has left once: a format error shows under them from then on.
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const renderCheckbox = (field: EnvelopeFieldView) => (
    <label key={field.key} className={d.check}>
      <input
        type="checkbox"
        checked={values[field.key] === true}
        onChange={(event) => onChange(field.key, event.target.checked)}
      />
      <span className={d.box} aria-hidden="true">
        {values[field.key] === true ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span>{field.label}</span>
    </label>
  );

  const renderField = (field: EnvelopeFieldView) => {
    // Prefilled values come from the rep's own profile; they stay read-only
    // until the rep asks to change them, so a stray tap cannot blank a name.
    const readOnly = field.prefilled && !unlocked[field.key];
    const formatError = fieldFormatError(envelope.docKey, field.key, String(values[field.key] ?? ''));
    const showFormatError = Boolean(formatError) && Boolean(blurred[field.key]);
    const oneOf = ONE_OF_RULES[envelope.docKey]?.find((rule) => rule.label && rule.keys.includes(field.key));
    const id = `${idPrefix}-${field.key}`;
    return (
      <div key={field.key} className={f.field}>
        <div className={f.label}>
          <label htmlFor={id}>
            {oneOf ? `${field.label.trim()} (${oneOf.label})` : fieldLabelWithOptional(field.label, field.required)}
          </label>
          {readOnly && (
            <button type="button" className={d.editButton} onClick={() => onUnlock(field.key)}>
              Edit
            </button>
          )}
        </div>
        <input
          id={id}
          className={`${f.input} ${d.input}`}
          value={String(values[field.key] ?? '')}
          readOnly={readOnly}
          onChange={(event) => onChange(field.key, event.target.value)}
          onBlur={() => setBlurred((current) => ({ ...current, [field.key]: true }))}
          aria-invalid={showFormatError || undefined}
          aria-describedby={showFormatError ? `${id}-error` : undefined}
          autoComplete="off"
          autoCapitalize={field.sensitive ? 'off' : 'sentences'}
          spellCheck={field.sensitive ? false : undefined}
          {...FIELD_INPUT[field.key]}
          maxLength={200}
        />
        {showFormatError && (
          <p id={`${id}-error`} className={f.fieldError}>
            {formatError}
          </p>
        )}
        {field.sensitive && (
          <p className={f.hint}>Written into this signed document only. Never saved to your profile.</p>
        )}
      </div>
    );
  };

  const textFields = envelope.fields.filter((field) => field.type !== 'checkbox');
  const checkFields = envelope.fields.filter((field) => field.type === 'checkbox');
  return (
    <>
      {textFields.length > 0 && <div className={f.grid}>{textFields.map(renderField)}</div>}
      {checkFields.length > 0 && <div className={d.checks}>{checkFields.map(renderCheckbox)}</div>}
    </>
  );
}

/** The e-sign consent statement as a required checkbox row. */
export function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`${d.check} ${d.consent}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={d.box} aria-hidden="true">
        {checked ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span>{ESIGN_CONSENT_TEXT}</span>
    </label>
  );
}
