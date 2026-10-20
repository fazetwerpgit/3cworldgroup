'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, FileText, RotateCcw } from 'lucide-react';
import { resolveUploadMime } from '@/lib/forms/formUploads';
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

// Slide 5: the homeowner's details and three bill/panel photos (or PDFs), in three short
// steps (who, where, photos) so each fits a laptop or a phone. Photos upload
// as soon as they are picked (one slot each, like ProofCapture) and are
// optional at submit; the lead POST carries the session's clientId so a retry
// returns the same lead.

type SlotUi = { status: 'uploading' | 'failed'; error?: string; file: File } | null;
/** What a tile shows of the picked file: the photo itself, or a PDF's name. */
type Preview = { kind: 'image'; url: string } | { kind: 'pdf'; name: string };

const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

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
  { key: 'first', label: 'First name', type: 'text', autoComplete: 'given-name' },
  { key: 'last', label: 'Last name', type: 'text', autoComplete: 'family-name' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email', inputMode: 'email' },
  { key: 'address', label: 'Street address', type: 'text', autoComplete: 'address-line1', className: s.fieldAddress },
  { key: 'city', label: 'City', type: 'text', autoComplete: 'address-level2', className: s.fieldCity },
  { key: 'state', label: 'State', type: 'text', autoComplete: 'address-level1', className: s.fieldState, maxLength: 2 },
  { key: 'zip', label: 'Zip', type: 'text', autoComplete: 'postal-code', inputMode: 'numeric', className: s.fieldZip, maxLength: 10 },
];

export type StepId = 'owner' | 'home' | 'photos';
const STEPS: { id: StepId; label: string; fields: (keyof LeadFields)[] }[] = [
  { id: 'owner', label: 'Homeowner', fields: ['first', 'last', 'phone', 'email'] },
  { id: 'home', label: 'Home', fields: ['address', 'city', 'state', 'zip'] },
  { id: 'photos', label: 'Photos', fields: [] },
];

const PHOTO_HINTS: Record<PhotoSlot, string> = {
  billPage1: 'Shows the meter number',
  billGraph: 'Usage by month (pg. 3-4)',
  panel: 'To know if it needs an upgrade',
};
const PHOTO_TITLES: Record<PhotoSlot, string> = {
  billPage1: 'Bill, first page',
  billGraph: 'Bill bar graph',
  panel: 'Electric panel',
};

export function LeadFormSlide({ onSaved, startStep }: { onSaved: () => void; startStep?: StepId | null }) {
  const { state, update } = useDeck();
  const [touched, setTouched] = useState<Partial<Record<keyof LeadFields, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  // The review slide's Edit opens the step holding that field.
  const [step, setStep] = useState(() => Math.max(0, STEPS.findIndex((st) => st.id === startStep)));
  // A field to focus once its step has rendered (the first error on submit or Next).
  const focusNext = useRef<keyof LeadFields | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [slots, setSlots] = useState<Partial<Record<PhotoSlot, SlotUi>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, Preview>>>({});
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

  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    document.getElementById(`solar-${key}`)?.focus();
  }, [step, focusTick]);

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
    let preview: Preview;
    if (resolveUploadMime(file.type, file.name) === 'application/pdf') {
      preview = { kind: 'pdf', name: file.name };
    } else {
      const url = URL.createObjectURL(file);
      previewUrls.current.push(url);
      preview = { kind: 'image', url };
    }
    setPreviews((prev) => ({ ...prev, [slot]: preview }));
    try {
      const path = await uploadFormAttachment({
        file,
        itemId: 'solar-lead',
        formType: 'solar-lead',
        slot,
        fields: { uploadId: state.uploadId },
        allowedTypes: UPLOAD_TYPES,
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

  const stepOf = (key: keyof LeadFields) => STEPS.findIndex((st) => st.fields.includes(key));

  /** Next on the first two steps: this step's fields must be right before moving on. */
  const advance = () => {
    const bad = STEPS[step].fields.find((k) => errors[k]);
    if (bad && !saved) {
      setTouched((prev) => ({ ...prev, ...Object.fromEntries(STEPS[step].fields.map((k) => [k, true])) }));
      focusNext.current = bad;
      setFocusTick((n) => n + 1);
      return;
    }
    setStep((cur) => Math.min(STEPS.length - 1, cur + 1));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saved) {
      onSaved();
      return;
    }
    // Enter in a field on an early step moves on instead of saving.
    if (step < STEPS.length - 1) {
      advance();
      return;
    }
    setTried(true);
    setAlert(null);
    if (Object.keys(errors).length > 0) {
      const first = FIELDS.find((f) => errors[f.key]);
      if (first) {
        focusNext.current = first.key;
        setStep(stepOf(first.key));
        setFocusTick((n) => n + 1);
      }
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
      uploadId: state.uploadId,
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
  const added = PHOTO_SLOTS.length - missing;
  const current = STEPS[step];
  const stepHasError = (i: number) => STEPS[i].fields.some((k) => (tried || touched[k]) && errors[k]);
  const last = step === STEPS.length - 1;

  return (
    <>
      <div className={s.head}>
        <p className={s.eyebrow}>Homeowner info</p>
        <h2 className={s.title}>
          Let&apos;s Gather <span className={s.accent}>Some Info</span>
        </h2>
      </div>
      <form className={s.formCard} onSubmit={submit} noValidate aria-label="Homeowner info">
        <div className={s.steps} role="group" aria-label="Info steps">
          {STEPS.map((st, i) => {
            const done = st.id === 'photos' ? added === PHOTO_SLOTS.length : st.fields.every((k) => !errors[k]);
            return (
              <button
                key={st.id}
                type="button"
                aria-current={i === step ? 'step' : undefined}
                className={s.stepTab}
                data-error={stepHasError(i) || undefined}
                onClick={() => setStep(i)}
              >
                <span className={s.stepNum} data-done={done || undefined} aria-hidden>
                  {done && i !== step ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                {st.label}
                {st.id === 'photos' ? <span className={s.stepCount}>{added}/{PHOTO_SLOTS.length}</span> : null}
              </button>
            );
          })}
        </div>

        {current.id !== 'photos' ? (
          <div className={s.form} role="group" aria-label={current.label}>
            {FIELDS.filter((f) => current.fields.includes(f.key)).map((f) => {
              const showError = (tried || touched[f.key]) && errors[f.key];
              return (
                <div key={f.key} className={`${s.field} ${f.className ?? ''}`}>
                  <label htmlFor={`solar-${f.key}`}>
                    {f.label}
                    <span className={s.req} aria-hidden>
                      *
                    </span>
                  </label>
                  <input
                    id={`solar-${f.key}`}
                    className={s.input}
                    name={f.key}
                    type={f.type}
                    inputMode={f.inputMode}
                    autoComplete={f.autoComplete}
                    autoCapitalize={f.key === 'email' ? 'off' : f.key === 'state' ? 'characters' : 'words'}
                    maxLength={f.maxLength}
                    placeholder={f.key === 'state' ? 'CA' : undefined}
                    required
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
          </div>
        ) : (
          <div className={s.photos} role="group" aria-label="Photos">
            {PHOTO_SLOTS.map(({ slot, label }) => {
              const ui = slots[slot];
              const preview = previews[slot];
              const done = Boolean(state.photos[slot]) && !ui;
              const stateName = ui?.status ?? (done ? 'done' : 'missing');
              const status =
                ui?.status === 'uploading'
                  ? 'Uploading...'
                  : ui?.status === 'failed'
                    ? ui.error
                    : done
                      ? 'Added. Tap to replace'
                      : 'Tap to add a photo or PDF';
              return (
                <button
                  key={slot}
                  type="button"
                  className={s.slotTile}
                  data-state={stateName}
                  aria-label={`${label}. ${status}`}
                  disabled={saved || ui?.status === 'uploading'}
                  onClick={() => {
                    if (ui?.status === 'failed') void upload(slot, ui.file);
                    else inputs.current[slot]?.click();
                  }}
                >
                  <span className={s.slotMedia}>
                    {preview?.kind === 'image' ? (
                      // Local object URL preview of the picked photo.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={s.slotThumb} src={preview.url} alt="" />
                    ) : null}
                    {preview?.kind === 'pdf' ? (
                      <span className={s.slotPdf}>
                        <FileText size={28} aria-hidden />
                        <span className={s.slotPdfName}>{preview.name}</span>
                      </span>
                    ) : null}
                    {preview?.kind === 'pdf' ? null : (
                      <span className={s.slotIcon} aria-hidden>
                        {ui?.status === 'failed' ? <RotateCcw size={20} /> : done ? <Check size={20} /> : <Camera size={20} />}
                      </span>
                    )}
                  </span>
                  <span className={s.slotText}>
                    <span className={s.slotLabel}>{PHOTO_TITLES[slot]}</span>
                    <span className={s.slotHint}>{PHOTO_HINTS[slot]}</span>
                    <span className={s.slotState}>{status}</span>
                  </span>
                  <input
                    ref={(el) => {
                      inputs.current[slot] = el;
                    }}
                    type="file"
                    accept="image/*,application/pdf"
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
        )}

        <div className={s.formFoot}>
          {saved ? (
            <button key="continue" className={s.primary} type="submit">
              Continue
            </button>
          ) : last ? (
            // Keyed apart from Next, so React never turns the clicked Next into a submit mid-click.
            <button key="save" className={s.primary} type="submit" disabled={sending} aria-busy={sending || undefined}>
              {sending ? 'Saving...' : 'Save and continue'}
            </button>
          ) : (
            <button key="next" className={s.primary} type="button" onClick={advance}>
              Next: {STEPS[step + 1].label}
              <ChevronRight size={18} aria-hidden />
            </button>
          )}
          {saved ? (
            <p className={s.note}>Saved for {state.lead.first.trim()}.</p>
          ) : last && missing > 0 ? (
            <p className={s.note}>
              {missing === 3 ? 'No photos yet.' : `${missing} photo${missing === 1 ? '' : 's'} missing.`} Photos are
              optional; you can save without them.
            </p>
          ) : !last ? (
            <p className={s.small}>All fields are required. Photos are optional.</p>
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
