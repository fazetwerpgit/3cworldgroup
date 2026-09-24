'use client';

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
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
  FileText,
  ImageUp,
  Loader2,
  RotateCcw,
  WifiOff,
  X,
} from 'lucide-react';
import { PdfPages } from '@/components/esign/PdfPages';
import { friendlyError } from '@/lib/forms/friendlyError';
import { isEmailShaped } from '@/lib/forms/managerInterview';
import { attachReducer, fileView, uploadFailure, type FileView } from './attachmentState';
import { BodyLayer } from './BodyLayer';
import { useHideRepTabBar } from './RepShell';
import s from './rep.module.css';
import f from './rep-forms.module.css';

// Direction D form kit for the rep request forms (fiber report, expedite,
// payroll dispute, leads request, manager interview). Field, error and submit
// patterns follow RepLogSale: 16px inputs on the ground, a label row with
// "Required", inline errors under the field, a block alert for server errors,
// and a submit bar fixed in the tab bar's place on phones.

// ---------- soft keyboard (shared with Log Sale) ----------
// The soft keyboard is up: a text field has focus on a touch device, or the
// visual viewport has shrunk well below the layout viewport. While it is, the
// submit bar leaves the fixed layer and sits at the end of the form, so it
// never rides the keyboard or covers the field being typed in.
//
// A tap that blurs a field collapses the in-flow submit bar. Collapsing it
// between the tap's down and its click moved the page under the finger, so the
// click missed its row (the e-sign consent box, TesterB 9/24). A change that
// arrives mid-tap is held until the click has landed; the snapshot is cached so
// an unrelated re-render cannot pick it up early either.
let keyboardShown = false;

function subscribeKeyboard(onChange: () => void) {
  const vv = window.visualViewport;
  let pressing = false;
  let held = false;
  let timer: number | undefined;
  const flush = () => {
    keyboardShown = keyboardOpenNow();
    onChange();
  };
  const notify = () => {
    if (pressing) held = true;
    else flush();
  };
  // After the click's own handlers, so the row it hit gets it.
  const release = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      pressing = false;
      if (held) {
        held = false;
        flush();
      }
    }, 0);
  };
  // Fallbacks: a long press or a drag may never click.
  const later = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(release, ms);
  };
  const press = () => {
    pressing = true;
    later(2000);
  };
  const lift = () => later(500);

  keyboardShown = keyboardOpenNow();
  vv?.addEventListener('resize', notify);
  document.addEventListener('focusin', notify);
  document.addEventListener('focusout', notify);
  document.addEventListener('pointerdown', press, true);
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('click', release, true);
  return () => {
    window.clearTimeout(timer);
    vv?.removeEventListener('resize', notify);
    document.removeEventListener('focusin', notify);
    document.removeEventListener('focusout', notify);
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('pointerup', lift, true);
    document.removeEventListener('pointercancel', release, true);
    document.removeEventListener('click', release, true);
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
  return useSyncExternalStore(subscribeKeyboard, () => keyboardShown, () => false);
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

  return { errors, validate, clear, reset: () => setErrors({}) };
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

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={f.section} aria-labelledby={id}>
      <h2 id={id} className={f.sectionHead}>
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
  /** Shown in place of the choices when there are none (or they failed to load). */
  emptyMessage?: ReactNode;
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
        <div className={f.empty}>{emptyMessage}</div>
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
      <h1 id="form-sent-h" ref={headRef} tabIndex={-1} className={f.sentTitle}>
        {title}
      </h1>
      <p className={f.sentMsg}>{message}</p>
      <p className={f.sentRef}>
        Reference <span className={f.sentRefId}>{referenceId}</span>
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
 * The form column plus its submit button. Desktop: the button sits under the
 * form with who is sending. Phones: the submit bar replaces the tab bar (in the
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
  submitter,
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
  submitter: string;
}) {
  useHideRepTabBar(true);
  const keyboardOpen = useSoftKeyboardOpen();
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
          {alert}
          <form id={formId} className={f.form} onSubmit={onSubmit} noValidate>
            {children}
          </form>
          {/* Desktop, and phones with the keyboard up: in the page flow. */}
          <div className={f.submitInline} data-keyboard={keyboardOpen ? 'open' : undefined}>
            {button}
            <p className={`${f.who} ${s.deskOnly}`}>
              Sending as <strong>{submitter}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Phones with the keyboard down: fixed in the tab bar's place. */}
      {keyboardOpen ? null : (
        <BodyLayer>
          <div className={f.submitBar}>{button}</div>
        </BodyLayer>
      )}
    </div>
  );
}

// ---------- attachments ----------
/**
 * One file slot (photo, screenshot or PDF). `upload` does the work (snapshot,
 * shrink, POST) and resolves to the storage folder path; it gets a signal that
 * Cancel (or leaving the page) aborts. While a file uploads the tile shows
 * Cancel; a timeout or lost signal leaves Retry for the same file. "View" shows
 * an attached photo or PDF in an in-page viewer (a new tab opens blank in the
 * iPhone home-screen app, so a PDF is drawn page by page like the e-sign one). `preview={false}` shows neither a thumbnail nor View, for
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
  upload: (file: File, signal: AbortSignal) => Promise<string>;
  onUploaded: (path: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [state, dispatch] = useReducer(
    attachReducer,
    initialDone ? { kind: 'done', name: 'File on record', localUrl: null, view: null } : { kind: 'idle' }
  );
  const urlRef = useRef<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const viewRef = useRef<HTMLButtonElement | null>(null);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const busyRef = useRef(false);
  const busyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    busyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  // Send is blocked only while a request is really in flight: Cancel, a result
  // and unmounting each report not-busy once.
  const setBusy = useCallback((busy: boolean) => {
    if (busyRef.current === busy) return;
    busyRef.current = busy;
    busyChangeRef.current?.(busy);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      setBusy(false);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [setBusy]
  );

  const pick = async (file: File | null | undefined) => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const run = ++runRef.current;
    fileRef.current = file;
    dispatch({ type: 'start', run, name: file.name });
    setBusy(true);
    try {
      const path = await upload(file, controller.signal);
      if (run !== runRef.current) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      // Sensitive slots never get a local copy, so there is nothing to view.
      const localUrl = preview ? URL.createObjectURL(file) : null;
      urlRef.current = localUrl;
      dispatch({ type: 'done', run, name: file.name, localUrl, view: fileView(file) });
      onUploaded(path);
    } catch (err) {
      const failure = uploadFailure(err);
      if (!failure.cancelled) dispatch({ type: 'fail', run, message: failure.message, retry: failure.retry });
    } finally {
      if (run === runRef.current) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const cancel = () => {
    runRef.current += 1; // whatever the stalled request says later is ignored
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'cancel' });
    setBusy(false);
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
          {preview && state.view === 'image' && state.localUrl ? (
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
            {state.localUrl && state.view ? (
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
      ) : state.kind === 'uploading' ? (
        <div className={f.fileRow} role="status">
          <span className={f.fileIcon} aria-hidden="true">
            <Loader2 size={20} className={f.spin} />
          </span>
          <span className={f.fileMeta}>
            <span className={f.fileName}>{state.name}</span>
            <span className={f.fileSub}>Uploading…</span>
          </span>
          <span className={f.fileActions}>
            <button type="button" className={f.fileBtn} onClick={cancel}>
              Cancel
            </button>
          </span>
        </div>
      ) : state.kind === 'error' && state.retry ? (
        <div className={`${f.fileRow} ${f.fileFailed}`}>
          <span className={f.fileIcon} aria-hidden="true">
            <RotateCcw size={20} />
          </span>
          <span className={f.fileMeta}>
            <span className={f.fileName}>{state.name}</span>
            <span className={f.fileSub}>Not attached</span>
          </span>
          <span className={f.fileActions}>
            <button type="button" className={f.fileBtn} onClick={() => void pick(fileRef.current)}>
              Retry
            </button>
            <label className={f.fileBtn}>
              {input}
              Other file
            </label>
          </span>
        </div>
      ) : (
        <label className={f.drop}>
          {input}
          {state.kind === 'error' ? (
            <RotateCcw size={20} aria-hidden="true" className={f.dropIcon} />
          ) : (
            <ImageUp size={20} aria-hidden="true" className={f.dropIcon} />
          )}
          <span className={f.dropText}>
            <span className={f.dropTitle}>{state.kind === 'error' ? 'Try another file' : 'Choose a file'}</span>
            <span className={f.dropSub}>{kinds} · 4 MB max</span>
          </span>
        </label>
      )}
      <FieldNote id={id} error={shownError} hint={hint} />
      {viewing && state.kind === 'done' && state.localUrl && state.view ? (
        <FileViewer
          src={state.localUrl}
          view={state.view}
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

/** A full-screen look at an attached photo or PDF, portaled to <body>. */
function FileViewer({
  src,
  view,
  name,
  onClose,
}: {
  src: string;
  view: Exclude<FileView, null>;
  name: string;
  onClose: () => void;
}) {
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
        <button
          ref={closeRef}
          type="button"
          className={`${s.iconBtn} ${f.viewerClose}`}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} aria-hidden="true" />
        </button>
        {view === 'pdf' ? (
          <div className={f.viewerDoc}>
            <PdfPages src={src} />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className={f.viewerImg} />
        )}
      </div>
    </BodyLayer>
  );
}
