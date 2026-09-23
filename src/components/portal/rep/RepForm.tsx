'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleCheck,
  FileText,
  ImageUp,
  Loader2,
  RotateCcw,
  WifiOff,
  X,
} from 'lucide-react';
import { friendlyError } from '@/lib/forms/friendlyError';
import { isEmailShaped } from '@/lib/forms/managerInterview';
import { BodyLayer } from './BodyLayer';
import { useHideRepTabBar } from './RepShell';
import s from './rep.module.css';
import f from './rep-forms.module.css';

// Direction D form kit for the rep request forms (fiber report, expedite,
// payroll dispute, leads request, manager interview). Field, error and submit
// patterns follow RepLogSale: 16px inputs on the ground, a label row with
// "Required", inline errors under the field, a block alert for server errors,
// and a submit bar fixed in the tab bar's place on phones.

// ---------- soft keyboard (same rule as Log Sale) ----------
function subscribeKeyboard(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onChange);
  };
}

function keyboardOpenNow(): boolean {
  const vv = window.visualViewport;
  if (vv && window.innerHeight - vv.height > 150) return true;
  const el = document.activeElement;
  const typing =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type));
  return typing && window.matchMedia('(pointer: coarse)').matches;
}

export function useSoftKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribeKeyboard, keyboardOpenNow, () => false);
}

// ---------- validation ----------
export interface FieldRule<T> {
  key: keyof T & string;
  /** Element id to scroll to (an input id, or a Choices name). */
  id: string;
  message: string;
  email?: boolean;
  /** Only checked while true (conditional fields). */
  when?: boolean;
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return value !== undefined && value !== null;
}

function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches('input, select, textarea')
    ? el
    : el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target?.focus({ preventScroll: true });
}

/**
 * Client-side check of the fields a form marks required, with Log Sale's
 * inline errors. The API routes still enforce the same rules.
 */
export function useFormCheck<T extends object>(form: T, rules: FieldRule<T>[]) {
  const [errors, setErrors] = useState<Partial<Record<keyof T & string, string>>>({});
  const active = rules.filter((rule) => rule.when !== false);
  const values = form as Record<string, unknown>;
  const done = active.filter((rule) => isFilled(values[rule.key])).length;

  const validate = (): boolean => {
    const next: Partial<Record<keyof T & string, string>> = {};
    let first: string | null = null;
    for (const rule of active) {
      const value = values[rule.key];
      let message: string | null = null;
      if (!isFilled(value)) message = rule.message;
      else if (rule.email && typeof value === 'string' && !isEmailShaped(value.trim())) message = 'Enter a valid email';
      if (message) {
        next[rule.key] = message;
        first ??= rule.id;
      }
    }
    setErrors(next);
    if (first) focusField(first);
    return first === null;
  };

  const clear = useCallback((key: keyof T & string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }, []);

  return { errors, done, total: active.length, validate, clear, reset: () => setErrors({}) };
}

// ---------- layout ----------
/** The forms hub: the phone top bar's back link on every form page (desktop uses FormHeader's). */
export const FORMS_BACK = { href: '/portal/forms', label: 'forms' };

/** Page header. On phones the top bar already carries the form name, so the h1 is visually hidden there. */
export function FormHeader({ title, lede, back = true }: { title: string; lede: ReactNode; back?: boolean }) {
  return (
    <header className={f.header}>
      {back ? (
        <Link href={FORMS_BACK.href} className={f.backLink}>
          <ArrowLeft size={16} aria-hidden="true" />
          All forms
        </Link>
      ) : null}
      <h1 className={f.title}>{title}</h1>
      <p className={f.lede}>{lede}</p>
    </header>
  );
}

export function FormSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = `form-section-${n}`;
  return (
    <section className={f.section} aria-labelledby={id}>
      <h2 id={id} className={f.sectionHead}>
        <b aria-hidden="true">{n}</b>
        {title}
      </h2>
      <div className={f.grid}>{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  required,
  wide,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${f.field} ${error ? f.fieldInvalid : ''} ${wide ? f.wide : ''}`}>
      <label htmlFor={id} className={f.label}>
        {label}
        {required ? <span className={f.req}>Required</span> : null}
      </label>
      {children}
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

function FieldNote({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-error`} className={f.fieldError}>
        <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className={f.hint}>
        {hint}
      </p>
    );
  }
  return null;
}

/** aria props for an input whose Field may show an error or a hint. */
export function describe(id: string, error: string | undefined, hasHint = false) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}

/**
 * Pick one of a list: radios drawn as chips (short labels) or as full-width
 * rows (long labels). Replaces FormsLineChoicePicker; the value is the
 * verbatim option string the API validates against.
 */
export function Choices({
  name,
  label,
  value,
  options,
  onChange,
  required,
  error,
  hint,
  columns,
  emptyMessage = 'No options set up yet.',
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  /** Fixed chip columns (a 1–5 rating reads as one row). */
  columns?: number;
  emptyMessage?: string;
}) {
  const isLong = (option: string) => option.length > 22;
  // Mostly long labels (leads categories): full-width rows. A stray long one in
  // a chip grid (a location) spans the grid instead.
  const rows = options.filter(isLong).length * 2 > options.length;
  const pair = options.length === 2 && !rows;
  return (
    <fieldset
      id={name}
      className={`${f.field} ${f.fieldset} ${f.wide} ${error ? f.fieldInvalid : ''}`}
      aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
    >
      <legend className={f.label}>
        {label}
        {required ? <span className={f.req}>Required</span> : null}
      </legend>
      {options.length === 0 ? (
        <p className={f.empty}>{emptyMessage}</p>
      ) : (
        <div
          className={rows ? f.rows : pair ? f.pair : f.chips}
          style={columns && !rows ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        >
          {options.map((option, i) => (
            <label key={option} className={rows ? f.row : `${f.chip} ${isLong(option) ? f.chipWide : ''}`}>
              <input
                type="radio"
                id={`${name}-${i}`}
                name={name}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {rows ? (
                <span className={f.radio} aria-hidden="true">
                  {value === option ? <Check size={14} strokeWidth={3} /> : null}
                </span>
              ) : null}
              {/* Let "Centurylink/Quantum" wrap at the slash, not mid-word. */}
              <span className={f.choiceText}>{option.replace(/\//g, '/\u200b')}</span>
            </label>
          ))}
        </div>
      )}
      <FieldNote id={name} error={error} hint={hint} />
    </fieldset>
  );
}

/** A yes/no decision stored as a boolean. */
export function YesNo({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Choices
      name={name}
      label={label}
      value={value ? 'Yes' : 'No'}
      options={['No', 'Yes']}
      onChange={(next) => onChange(next === 'Yes')}
    />
  );
}

/** Server or network failure after submit. The form keeps what was typed. */
export function FormAlert({ message, alertRef }: { message: string; alertRef?: RefObject<HTMLDivElement | null> }) {
  const shown = friendlyError(message);
  return (
    <div ref={alertRef} className={f.alert} role="alert">
      {shown.offline ? (
        <WifiOff size={20} strokeWidth={2} aria-hidden="true" />
      ) : (
        <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
      )}
      <p>
        <strong>Not sent.</strong> {shown.message}
      </p>
    </div>
  );
}

/** Counts uploads in flight across a form's Attachment fields. */
export function useUploadsInFlight() {
  const [count, setCount] = useState(0);
  const onBusyChange = useCallback((busy: boolean) => setCount((n) => Math.max(0, n + (busy ? 1 : -1))), []);
  return { uploading: count > 0, onBusyChange };
}

export const UPLOADING_MESSAGE = 'A file is still uploading. Send again once it shows Attached.';

/** Scroll the block alert into view when a submit fails. */
export function useAlertScroll(message: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [message]);
  return ref;
}

/** Shown in place of the form once the API accepts it. */
export function FormSent({
  title,
  message,
  referenceId,
  againLabel,
  onAgain,
}: {
  title: string;
  message: string;
  referenceId: string;
  againLabel: string;
  onAgain: () => void;
}) {
  const headRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headRef.current?.focus();
  }, []);
  return (
    <section className={`${s.panel} ${f.sent}`} role="status" aria-labelledby="form-sent-h">
      <CircleCheck size={40} strokeWidth={1.75} className={f.sentIcon} aria-hidden="true" />
      <h1 id="form-sent-h" ref={headRef} tabIndex={-1} className={f.sentTitle}>
        {title}
      </h1>
      <p className={f.sentMsg}>{message}</p>
      <p className={f.sentRef}>
        <span className={s.kicker}>Reference</span>
        <span className={f.sentRefId}>{referenceId}</span>
      </p>
      <div className={f.sentActions}>
        <Link href="/portal/dashboard" className={`${s.btnPrimary} ${f.sentBtn}`}>
          Back to dashboard
        </Link>
        <button type="button" className={`${s.btnSecondary} ${f.sentBtn}`} onClick={onAgain}>
          {againLabel}
        </button>
      </div>
    </section>
  );
}

/**
 * The form column plus its submit panel. Desktop: a sticky side panel with the
 * required-field meter, the reviewer note and the submit button. Phones: the
 * note sits under the header and the submit bar replaces the tab bar (in the
 * page flow while the soft keyboard is up), as on Log Sale.
 */
export function FormFrame({
  formId,
  onSubmit,
  header,
  alert,
  children,
  submitLabel,
  saving,
  uploading,
  disabled,
  done,
  total,
  submitter,
  routeTo,
  note,
}: {
  formId: string;
  onSubmit: (event: React.FormEvent) => void;
  header: ReactNode;
  alert?: ReactNode;
  children: ReactNode;
  submitLabel: string;
  saving: boolean;
  /** A file is still uploading: the button says so and the page's submit waits. */
  uploading?: boolean;
  disabled?: boolean;
  done: number;
  total: number;
  submitter: string;
  /** Who reviews it, e.g. "Payroll review". */
  routeTo: string;
  note: string;
}) {
  useHideRepTabBar(true);
  const keyboardOpen = useSoftKeyboardOpen();
  const meter = <Meter done={done} total={total} />;
  const button = (
    <button
      type="submit"
      form={formId}
      className={`${s.btnPrimary} ${f.submit}`}
      disabled={saving}
      aria-disabled={disabled || uploading || undefined}
    >
      {saving ? 'Sending…' : uploading ? 'Uploading…' : submitLabel}
    </button>
  );

  return (
    <div className={f.page}>
      <div className={f.frame}>
        <div className={f.body}>
          {header}
          <p className={`${f.who} ${s.phoneOnly}`}>
            Sending as <strong>{submitter}</strong>. Goes to {routeTo.toLowerCase()}.
          </p>
          {alert}
          <form id={formId} className={f.form} onSubmit={onSubmit} noValidate>
            {children}
          </form>
          {/* Phones with the keyboard up: in the page flow. */}
          <div className={f.submitInline} data-keyboard={keyboardOpen ? 'open' : undefined}>
            {meter}
            {button}
          </div>
        </div>

        <aside className={`${s.panel} ${f.aside} ${s.deskOnly}`} aria-label="Send">
          <p className={s.kicker}>Goes to</p>
          <p className={f.asideRoute}>{routeTo}</p>
          <p className={f.asideNote}>{note}</p>
          {meter}
          {button}
          <p className={f.asideWho}>
            Sending as <strong>{submitter}</strong>
          </p>
        </aside>
      </div>

      {/* Phones with the keyboard down: fixed in the tab bar's place. */}
      {keyboardOpen ? null : (
        <BodyLayer>
          <div className={f.submitBar}>
            {meter}
            {button}
          </div>
        </BodyLayer>
      )}
    </div>
  );
}

function Meter({ done, total }: { done: number; total: number }) {
  if (total === 0) {
    return (
      <p className={f.meter}>
        <span className={f.meterLabel}>Every field is optional</span>
      </p>
    );
  }
  const pct = Math.round((done / total) * 100);
  return (
    <p className={f.meter}>
      <span className={f.meterLabel}>
        <span className={f.meterNum}>
          {done}/{total}
        </span>{' '}
        required
      </span>
      <span className={`${s.track} ${f.meterTrack}`} aria-hidden="true">
        <span className={s.fill} style={{ width: `${pct}%` }} />
      </span>
    </p>
  );
}

// ---------- attachments ----------
type AttachState =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string }
  | { kind: 'done'; name: string; localUrl: string | null; isImage: boolean }
  | { kind: 'error'; message: string };

/**
 * One file slot (photo, screenshot or PDF). `upload` does the work (snapshot,
 * shrink, POST) and resolves to the storage folder path. "View" shows an
 * attached photo in an in-page viewer (a new tab opens blank in the iPhone
 * home-screen app). `preview={false}` shows neither a thumbnail nor View, for
 * sensitive documents (license, W-9).
 */
export function Attachment({
  id,
  label,
  hint,
  error,
  accept,
  kinds = 'Photo, screenshot or PDF',
  preview = true,
  initialDone = false,
  upload,
  onUploaded,
  onBusyChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  accept: string;
  /** What the picker takes, in words. */
  kinds?: string;
  preview?: boolean;
  /** A file is already on record (resubmission): start in the attached state. */
  initialDone?: boolean;
  upload: (file: File) => Promise<string>;
  onUploaded: (path: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState<AttachState>(
    initialDone ? { kind: 'done', name: 'File on record', localUrl: null, isImage: false } : { kind: 'idle' }
  );
  const urlRef = useRef<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const viewRef = useRef<HTMLButtonElement | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState({ kind: 'uploading', name: file.name });
    onBusyChange?.(true);
    try {
      const path = await upload(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      // Sensitive slots never get a local copy, so there is nothing to view.
      const localUrl = preview ? URL.createObjectURL(file) : null;
      urlRef.current = localUrl;
      setState({ kind: 'done', name: file.name, localUrl, isImage: file.type.startsWith('image/') });
      onUploaded(path);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      onBusyChange?.(false);
    }
  };

  const input = (
    <input
      id={id}
      type="file"
      accept={accept}
      className={s.srOnly}
      {...describe(id, error ?? (state.kind === 'error' ? state.message : undefined), Boolean(hint))}
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Clear so picking the same file again still fires onChange.
        e.target.value = '';
        void pick(file);
      }}
      disabled={state.kind === 'uploading'}
    />
  );

  const shownError = error ?? (state.kind === 'error' ? state.message : undefined);

  return (
    <div className={`${f.field} ${f.wide} ${shownError ? f.fieldInvalid : ''}`}>
      <label htmlFor={id} className={f.label}>
        {label}
      </label>
      {state.kind === 'done' ? (
        <div className={f.fileRow}>
          {preview && state.isImage && state.localUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.localUrl} alt="" className={f.fileThumb} />
          ) : (
            <span className={f.fileIcon} aria-hidden="true">
              <FileText size={20} />
            </span>
          )}
          <span className={f.fileMeta}>
            <span className={f.fileName}>{state.name}</span>
            <span className={f.fileOk}>
              <Check size={14} strokeWidth={3} aria-hidden="true" />
              Attached
            </span>
          </span>
          <span className={f.fileActions}>
            {state.localUrl && state.isImage ? (
              <button ref={viewRef} type="button" className={f.fileBtn} onClick={() => setViewing(true)}>
                View
              </button>
            ) : null}
            <label className={f.fileBtn}>
              {input}
              Replace
            </label>
          </span>
        </div>
      ) : (
        <label className={`${f.drop} ${state.kind === 'uploading' ? f.dropBusy : ''}`}>
          {input}
          {state.kind === 'uploading' ? (
            <>
              <Loader2 size={20} className={f.spin} aria-hidden="true" />
              <span className={f.dropText}>
                <span className={f.dropTitle}>Uploading…</span>
                <span className={f.dropSub}>{state.name}</span>
              </span>
            </>
          ) : (
            <>
              {state.kind === 'error' ? (
                <RotateCcw size={20} aria-hidden="true" className={f.dropIcon} />
              ) : (
                <ImageUp size={20} aria-hidden="true" className={f.dropIcon} />
              )}
              <span className={f.dropText}>
                <span className={f.dropTitle}>{state.kind === 'error' ? 'Try another file' : 'Choose a file'}</span>
                <span className={f.dropSub}>{kinds} · 4 MB max</span>
              </span>
            </>
          )}
        </label>
      )}
      <FieldNote id={id} error={shownError} hint={hint} />
      {viewing && state.kind === 'done' && state.localUrl ? (
        <PhotoViewer
          src={state.localUrl}
          name={state.name}
          onClose={() => {
            setViewing(false);
            viewRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** A full-screen look at an attached photo, portaled to <body>. */
function PhotoViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <BodyLayer>
      <div
        className={`${s.backdrop} ${f.viewer}`}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <button ref={closeRef} type="button" className={`${s.iconBtn} ${f.viewerClose}`} aria-label="Close" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className={f.viewerImg} />
      </div>
    </BodyLayer>
  );
}
