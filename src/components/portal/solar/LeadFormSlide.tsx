'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FormUploadError,
  isUploadCancelled,
  uploadFormAttachment,
} from '@/lib/forms/uploadFormAttachment';
import { useDeck } from './deckState';
import {
  createLead,
  PHOTO_SLOTS,
  solarAuthHeaders,
  validateLead,
  type LeadFields,
  type PhotoSlot,
} from './solarClient';
import s from './solarDeck.module.css';

// Slide 5: the homeowner's details and three bill/panel photos. Photos upload
// as soon as they are picked (one slot each, like ProofCapture) and are
// optional at submit; the lead POST carries the session's clientId so a retry
// returns the same lead.

type SlotUi = { status: 'uploading' | 'failed'; error?: string; file: File } | null;

type FieldDef = {
  key: keyof LeadFields;
  label: string;
  type: string;
  autoComplete: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
  maxLength?: number;
};

const FIELDS: FieldDef[] = [
  { key: 'first', label: 'First Name', type: 'text', autoComplete: 'given-name' },
  { key: 'last', label: 'Last Name', type: 'text', autoComplete: 'family-name' },
  { key: 'address', label: 'Address', type: 'text', autoComplete: 'address-line1', className: s.fieldWide },
  { key: 'city', label: 'City', type: 'text', autoComplete: 'address-level2', className: s.fieldCity },
  { key: 'state', label: 'State', type: 'text', autoComplete: 'address-level1', className: s.fieldState, maxLength: 2 },
  { key: 'zip', label: 'Zip', type: 'text', autoComplete: 'postal-code', inputMode: 'numeric', className: s.fieldZip, maxLength: 10 },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email', inputMode: 'email' },
];

export function LeadFormSlide({ onSaved }: { onSaved: () => void }) {
  const { state, update } = useDeck();
  const [touched, setTouched] = useState<Partial<Record<keyof LeadFields, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [slots, setSlots] = useState<Partial<Record<PhotoSlot, SlotUi>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});
  const inputs = useRef<Partial<Record<PhotoSlot, HTMLInputElement | null>>>({});
  const aborts = useRef<Partial<Record<PhotoSlot, AbortController>>>({});

  useEffect(() => {
    const controllers = aborts.current;
    return () => Object.values(controllers).forEach((c) => c?.abort());
  }, []);
  const previewUrls = useRef<string[]>([]);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const errors = validateLead(state.lead);
  const uploading = Object.values(slots).some((v) => v?.status === 'uploading');
  const saved = Boolean(state.leadId);

  const setField = (key: keyof LeadFields, value: string) =>
    update((prev) => ({ lead: { ...prev.lead, [key]: key === 'state' ? value.toUpperCase() : value } }));

  const upload = async (slot: PhotoSlot, file: File) => {
    aborts.current[slot]?.abort();
    const controller = new AbortController();
    aborts.current[slot] = controller;
    setSlots((prev) => ({ ...prev, [slot]: { status: 'uploading', file } }));
    const url = URL.createObjectURL(file);
    previewUrls.current.push(url);
    setPreviews((prev) => ({ ...prev, [slot]: url }));
    try {
      const path = await uploadFormAttachment({
        file,
        itemId: 'solar-lead',
        formType: 'solar-lead',
        slot,
        fields: { uploadId: state.uploadId },
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
        getHeaders: solarAuthHeaders,
        signal: controller.signal,
      });
      setSlots((prev) => ({ ...prev, [slot]: null }));
      update((prev) => ({ photos: { ...prev.photos, [slot]: path } }));
    } catch (error) {
      if (isUploadCancelled(error)) return;
      const message = error instanceof FormUploadError ? error.message : 'Upload failed. Tap to retry.';
      setSlots((prev) => ({ ...prev, [slot]: { status: 'failed', error: message, file } }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setAlert(null);
    if (saved) {
      onSaved();
      return;
    }
    if (Object.keys(errors).length > 0) {
      const first = FIELDS.find((f) => errors[f.key]);
      if (first) document.getElementById(`solar-${first.key}`)?.focus();
      return;
    }
    if (uploading) {
      setAlert('A photo is still uploading. One moment.');
      return;
    }
    setSending(true);
    const lead = state.lead;
    const res = await createLead({
      clientId: state.clientId,
      first: lead.first.trim(),
      last: lead.last.trim(),
      address: lead.address.trim(),
      city: lead.city.trim(),
      state: lead.state.trim().toUpperCase(),
      zip: lead.zip.trim(),
      phone: lead.phone.trim(),
      email: lead.email.trim(),
      monthlyBill: state.monthlyBill,
      photos: state.photos,
    });
    setSending(false);
    if (!res.ok || !res.data?.id) {
      setAlert(res.ok ? 'Could not save. Try again.' : res.error);
      return;
    }
    update({ leadId: res.data.id });
    onSaved();
  };

  const missing = PHOTO_SLOTS.filter((p) => !state.photos[p.slot]).length;

  return (
    <>
      <h2 className={s.title}>
        Let&apos;s Gather <span className={s.accent}>Some Info</span>
      </h2>
      <form className={s.form} onSubmit={submit} noValidate>
        {FIELDS.map((f) => {
          const showError = (tried || touched[f.key]) && errors[f.key];
          return (
            <div key={f.key} className={`${s.field} ${f.className ?? ''}`}>
              <label htmlFor={`solar-${f.key}`}>{f.label}</label>
              <input
                id={`solar-${f.key}`}
                className={s.input}
                name={f.key}
                type={f.type}
                inputMode={f.inputMode}
                autoComplete={f.autoComplete}
                autoCapitalize={f.key === 'email' ? 'off' : f.key === 'state' ? 'characters' : 'words'}
                maxLength={f.maxLength}
                value={state.lead[f.key]}
                disabled={saved}
                onChange={(e) => setField(f.key, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                aria-invalid={showError ? true : undefined}
                aria-describedby={showError ? `solar-${f.key}-err` : undefined}
              />
              {showError ? (
                <span id={`solar-${f.key}-err`} className={s.err}>
                  {errors[f.key]}
                </span>
              ) : null}
            </div>
          );
        })}

        <div className={s.photos}>
          {PHOTO_SLOTS.map(({ slot, label }) => {
            const ui = slots[slot];
            const done = Boolean(state.photos[slot]) && !ui;
            const stateName = ui?.status ?? (done ? 'done' : 'missing');
            const status =
              ui?.status === 'uploading'
                ? 'Uploading...'
                : ui?.status === 'failed'
                  ? ui.error
                  : done
                    ? 'Added. Tap to replace'
                    : 'Missing. Tap to add a photo';
            return (
              <button
                key={slot}
                type="button"
                className={s.slotTile}
                data-state={stateName}
                disabled={saved || ui?.status === 'uploading'}
                onClick={() => {
                  if (ui?.status === 'failed') void upload(slot, ui.file);
                  else inputs.current[slot]?.click();
                }}
              >
                {previews[slot] ? (
                  // Local object URL preview of the picked photo.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={s.slotThumb} src={previews[slot]} alt="" />
                ) : null}
                <span className={s.slotLabel}>{label}</span>
                <span className={s.slotState}>{status}</span>
                <input
                  ref={(el) => {
                    inputs.current[slot] = el;
                  }}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void upload(slot, file);
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className={s.formFoot}>
          <button className={s.primary} type="submit" disabled={sending}>
            {saved ? 'Continue' : sending ? 'Saving...' : 'Save and continue'}
          </button>
          {saved ? (
            <p className={s.note}>Saved for {state.lead.first.trim()}.</p>
          ) : missing > 0 ? (
            <p className={s.note}>
              {missing === 3 ? 'No photos yet.' : `${missing} photo${missing === 1 ? '' : 's'} missing.`} Photos are
              optional; you can save without them.
            </p>
          ) : null}
          {alert ? (
            <p className={s.alert} role="alert">
              {alert}
            </p>
          ) : null}
        </div>
      </form>
    </>
  );
}
