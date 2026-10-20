'use client';

import {
  BLOCKED_ROOF_TYPES,
  ROOF_TYPES,
  ROOF_TYPE_LABELS,
  isBlockedRoofType,
  type BlockedRoofType,
  type RoofType,
} from '@/lib/solar/leadFields';
import s from './solarDeck.module.css';

export type RoofChoice = RoofType | BlockedRoofType;

const CHOICES: RoofChoice[] = [...ROOF_TYPES, ...BLOCKED_ROOF_TYPES];

/** Inline error for the roof question, or '' when the lead may go on. */
export function roofError(roof: RoofChoice | null): string {
  if (!roof) return 'Pick the roof type';
  if (isBlockedRoofType(roof)) return `${ROOF_TYPE_LABELS[roof]} roofs don't qualify, so this lead stops here.`;
  return '';
}

/**
 * The roof question on the lead form's Home step, as the knock app asks it.
 * Concrete tile, shingle and flat qualify; metal, clay and wood shingle stop
 * the lead (the server refuses them too).
 */
export function RoofTypeField({
  value,
  onChange,
  showError,
  disabled,
}: {
  value: RoofChoice | null;
  onChange: (roof: RoofChoice) => void;
  showError: boolean;
  disabled?: boolean;
}) {
  const error = roofError(value);
  const blocked = isBlockedRoofType(value);
  const visible = blocked || (showError && error);
  return (
    <div className={`${s.field} ${s.fieldRoof}`} role="group" aria-labelledby="solar-roof-l">
      <span id="solar-roof-l" className={s.fieldRoofLabel}>
        Roof type
        <span className={s.req} aria-hidden>
          *
        </span>
      </span>
      <div className={s.chips}>
        {CHOICES.map((roof) => (
          <button
            key={roof}
            id={roof === CHOICES[0] ? 'solar-roofType' : undefined}
            type="button"
            className={s.quick}
            aria-pressed={value === roof}
            disabled={disabled}
            onClick={() => onChange(roof)}
          >
            {ROOF_TYPE_LABELS[roof]}
          </button>
        ))}
      </div>
      {visible ? (
        <span className={s.err} role={blocked ? 'alert' : undefined}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
