'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSales, type CreateSaleResult } from '@/hooks/useSales';
import type { FiberPlan, Sale, SaleProduct, SaleType } from '@/types';
import { addPlanToProducts, isExtraPlanId } from '@/lib/sales/planSelection';
import { hasSaleProof } from '@/lib/sales/proof';
import { MAX_PROOF_SCREENSHOTS, proofPathFields, saleProofPaths } from '@/lib/sales/proofPaths';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import { randomHex } from '@/lib/randomHex';

// Everything a new-sale form needs except its markup, so the old SaleForm and
// the direction-D Log Sale page share one set of rules: the draft, the
// idempotency key, the sale-date inference, validation and the submit payload.

// In-progress sale kept in sessionStorage so a reload, a crash or a lost
// connection mid-submit never costs the rep the entry. Keyed per user so a
// shared phone never shows one rep's customer to the next. File objects are
// never stored — an uploaded screenshot survives as its storage path.
//
// v1 stays the key: a draft now also carries formData.proofScreenshotPaths,
// and formData.proofScreenshotPath (the first path) is still written, so a
// draft round-trips with the previous build in either direction.
//
// A draft carries savedAt (the last edit) and is dropped once it is older than
// DRAFT_MAX_AGE_MS: by then it is a door from yesterday, not an interruption.
// A draft from before savedAt existed is taken as fresh and stamped on save.
export const DRAFT_KEY_PREFIX = 'sale-draft:v1:';
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DRAFT_SAVE_DELAY_MS = 400;
const CLIENT_SALE_ID_RE = /^[a-f0-9]{32}$/;

export type SaleFormFields = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  saleType: SaleType;
  saleDate: string;
  installDate: string;
  notes: string;
  orderNumberOrBtn: string;
};

/** Keys that can carry an inline error. `plan` is the plan picker. */
export type SaleFieldKey = 'customerAddress' | 'plan' | 'saleDate' | 'installDate' | 'orderNumberOrBtn';
export type SaleFieldErrors = Partial<Record<SaleFieldKey, string>>;

export interface SaleDraft {
  formData: SaleFormFields & { proofScreenshotPath?: string; proofScreenshotPaths?: string[] };
  products: SaleProduct[];
  saleDateTouched: boolean;
  proofUploadId: string;
  /** A submit already went out under proofUploadId (it may have landed). */
  keyUsed?: boolean;
  /** Epoch ms of the last edit; absent on a draft from an older build. */
  savedAt?: number;
}

/** A fresh idempotency key: 32 hex, the CLIENT_SALE_ID_RE shape. */
export function newClientSaleId(): string {
  return randomHex();
}

const DRAFT_TEXT_FIELDS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'customerAddress',
  'saleDate',
  'installDate',
  'notes',
  'orderNumberOrBtn',
] as const;
const SALE_TYPES: readonly unknown[] = ['new_service', 'upgrade', 'add_on', 'renewal'] satisfies SaleType[];

const isFiniteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/** A saved product the page can render; anything else in a draft is dropped. */
function isDraftProduct(value: unknown): value is SaleProduct {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.productId === 'string' &&
    typeof p.productName === 'string' &&
    typeof p.company === 'string' &&
    [p.quantity, p.unitPrice, p.totalPrice, p.points].every(isFiniteNumber)
  );
}

/**
 * The saved draft, reduced to what the form can safely show. A draft from an
 * older build, or one damaged in storage, must never crash the page: a field
 * that is not a string is left empty and a product that is not whole is dropped.
 */
export function readSaleDraft(key: string, now = Date.now()): SaleDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Record<string, unknown> | null;
    if (!draft || typeof draft !== 'object' || !draft.formData || typeof draft.formData !== 'object') {
      return null;
    }
    if (!Array.isArray(draft.products)) return null;
    const savedAt = isFiniteNumber(draft.savedAt) ? (draft.savedAt as number) : undefined;
    if (savedAt !== undefined && now - savedAt > DRAFT_MAX_AGE_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    const saved = draft.formData as Record<string, unknown>;
    const formData: Partial<SaleDraft['formData']> = proofPathFields(saleProofPaths(saved));
    for (const name of DRAFT_TEXT_FIELDS) {
      if (typeof saved[name] === 'string') formData[name] = saved[name];
    }
    if (SALE_TYPES.includes(saved.saleType)) formData.saleType = saved.saleType as SaleType;
    return {
      formData: formData as SaleDraft['formData'],
      products: draft.products.filter(isDraftProduct),
      saleDateTouched: draft.saleDateTouched === true,
      proofUploadId: typeof draft.proofUploadId === 'string' ? draft.proofUploadId : '',
      keyUsed: draft.keyUsed === true,
      savedAt,
    };
  } catch {
    return null;
  }
}

function writeSaleDraft(key: string, draft: SaleDraft | null) {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage full or blocked (private mode) — the draft is a convenience only.
  }
}

/** Anything the rep actually entered; a pristine form is not worth restoring. */
function hasDraftContent(formData: SaleFormFields, products: SaleProduct[], proofPaths: string[]): boolean {
  return (
    products.length > 0 ||
    proofPaths.length > 0 ||
    [
      formData.customerName,
      formData.customerPhone,
      formData.customerEmail,
      formData.customerAddress,
      formData.installDate,
      formData.notes,
      formData.orderNumberOrBtn,
    ].some((value) => value.trim() !== '')
  );
}

/** True for a YYYY-MM-DD value on a day earlier than today. */
const isBeforeToday = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value < todaySaleDateInput();

function emptyFields(): SaleFormFields {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    saleType: 'new_service' as SaleType,
    saleDate: todaySaleDateInput(),
    installDate: '',
    notes: '',
    orderNumberOrBtn: '',
  };
}

/**
 * Field errors in submit order. Pure so the rules are testable without a DOM.
 */
export function validateSaleForm(input: {
  formData: SaleFormFields;
  products: SaleProduct[];
  proofPaths: string[];
}): SaleFieldErrors {
  const { formData, products, proofPaths } = input;
  const errors: SaleFieldErrors = {};
  const today = todaySaleDateInput();

  if (!formData.customerAddress.trim()) errors.customerAddress = 'Enter the service address';
  if (products.length === 0) errors.plan = 'Pick a plan';
  if (!formData.saleDate) errors.saleDate = 'Pick the sale date';
  else if (formData.saleDate > today) errors.saleDate = 'Sale date cannot be in the future';
  if (!formData.installDate) errors.installDate = 'Pick the install date';
  // An install can never precede its own sale; catch it here so the rep sees
  // it inline rather than as the server's 400 on submit.
  if (!errors.saleDate && formData.installDate && formData.saleDate > formData.installDate) {
    errors.saleDate = 'Sale date cannot be after the install date';
  }
  if (!hasSaleProof({ orderNumberOrBtn: formData.orderNumberOrBtn, proofScreenshotPaths: proofPaths })) {
    errors.orderNumberOrBtn = 'Enter the order number or BTN, or attach a screenshot';
  }
  return errors;
}

/** Case and spacing never make two entries different ("1 main  st" = "1 Main St"). */
const normalizeEntryText = (value: unknown) =>
  (typeof value === 'string' ? value : '').trim().replace(/\s+/g, ' ').toLowerCase();

const entryProductIds = (products: unknown) =>
  Array.isArray(products)
    ? products.map((p) => normalizeEntryText((p as { productId?: unknown } | null)?.productId)).sort()
    : null;

/**
 * True when a sale the server returned as a duplicate is the entry on screen:
 * the same customer, address and plan/extras. A retry after a lost response
 * comes back as exactly that, and it is a logged sale, not a clash. The key
 * alone does not decide it: a rep can edit the entry into another customer
 * after a submit that landed unseen, and that one must not be dropped.
 */
export function isSameSaleEntry(
  sale: Partial<Pick<Sale, 'customerName' | 'customerAddress' | 'products'>> | null | undefined,
  entry: { formData: Pick<SaleFormFields, 'customerName' | 'customerAddress'>; products: SaleProduct[] }
): boolean {
  if (!sale) return false;
  const stored = entryProductIds(sale.products);
  const onScreen = entryProductIds(entry.products);
  return (
    stored !== null &&
    onScreen !== null &&
    stored.length === onScreen.length &&
    stored.every((id, i) => id === onScreen[i]) &&
    normalizeEntryText(sale.customerName) === normalizeEntryText(entry.formData.customerName) &&
    normalizeEntryText(sale.customerAddress) === normalizeEntryText(entry.formData.customerAddress)
  );
}

export function useSaleFormState() {
  const { user } = useAuth();
  const { createSale, loading, error: serverError } = useSales();

  const [formData, setFormData] = useState<SaleFormFields>(emptyFields);
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [proofPaths, setProofPathsState] = useState<string[]>([]);
  // Once the rep sets the sale date themselves the install date stops driving
  // it; `saleDateFromInstall` only controls which hint is shown.
  const [saleDateTouched, setSaleDateTouched] = useState(false);
  const [saleDateFromInstall, setSaleDateFromInstall] = useState(false);
  const [errors, setErrors] = useState<SaleFieldErrors>({});
  const [formError, setFormError] = useState('');
  // Bumped on every failed submit so the scroll effect re-runs for the same error.
  const [attempt, setAttempt] = useState(0);
  // Doubles as the sale's idempotency key (sent as clientSaleId): a resubmit
  // after a lost response lands on the same sale instead of a duplicate. Also
  // the stem of every proof upload slot for this sale.
  const [proofUploadId, setProofUploadId] = useState(newClientSaleId);
  // A submit went out under the current key, so it may already name a stored
  // sale. Once the entry is cleared the key must not carry over to the next
  // one, or that sale would come back as the old one (duplicate) and be lost.
  const [keyUsed, setKeyUsed] = useState(false);
  /** The server already had a sale under this key: the one it returned. */
  const [duplicateOf, setDuplicateOf] = useState<Sale | null>(null);
  const draftKey = user ? `${DRAFT_KEY_PREFIX}${user.uid}` : null;
  const [draftRestored, setDraftRestored] = useState(false);
  /** The entry came back from a saved draft (drives "N screenshots attached"). */
  const [fromDraft, setFromDraft] = useState(false);
  // Start over hides the useSales error of the entry it threw away.
  const [serverErrorHidden, setServerErrorHidden] = useState(false);
  // The restored draft's savedAt, kept by the first save after the restore so
  // merely reopening the page never makes an old draft look fresh. A draft
  // without one (an older build) is stamped with now.
  const [restoredSavedAt, setRestoredSavedAt] = useState<number | undefined>();
  const savedAtSpentRef = useRef(false);
  const submittedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Restore once the user is known — during render (React's "adjust state
  // when a prop changes" pattern), so the first paint already shows the draft.
  // An untouched sale date is re-derived rather than restored, so a draft from
  // yesterday is not dated yesterday. A draft with nothing typed in it is not
  // restored: there is nothing to pick up.
  if (draftKey && !draftRestored) {
    setDraftRestored(true);
    const draft = readSaleDraft(draftKey);
    if (draft && hasDraftContent({ ...emptyFields(), ...draft.formData }, draft.products, saleProofPaths(draft.formData))) {
      const { proofScreenshotPath: _legacy, proofScreenshotPaths: _paths, ...fields } = draft.formData;
      void _legacy;
      void _paths;
      const restored = { ...emptyFields(), ...fields };
      if (!draft.saleDateTouched) {
        const backdated = isBeforeToday(restored.installDate);
        restored.saleDate = backdated ? restored.installDate : todaySaleDateInput();
        setSaleDateFromInstall(backdated);
      }
      setFormData(restored);
      setProducts(draft.products);
      setProofPathsState(saleProofPaths(draft.formData).slice(0, MAX_PROOF_SCREENSHOTS));
      setSaleDateTouched(Boolean(draft.saleDateTouched));
      if (CLIENT_SALE_ID_RE.test(draft.proofUploadId)) {
        setProofUploadId(draft.proofUploadId);
        setKeyUsed(draft.keyUsed === true);
      }
      setFromDraft(true);
      setRestoredSavedAt(draft.savedAt);
    }
  }

  // Debounced save of the in-progress entry.
  useEffect(() => {
    if (!draftKey || !draftRestored || submittedRef.current) return;
    const timer = window.setTimeout(() => {
      if (submittedRef.current) return;
      const savedAt = savedAtSpentRef.current ? Date.now() : (restoredSavedAt ?? Date.now());
      savedAtSpentRef.current = true;
      writeSaleDraft(
        draftKey,
        hasDraftContent(formData, products, proofPaths)
          ? {
              formData: { ...formData, ...proofPathFields(proofPaths) },
              products,
              saleDateTouched,
              proofUploadId,
              keyUsed,
              savedAt,
            }
          : null
      );
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftRestored, formData, products, proofPaths, saleDateTouched, proofUploadId, keyUsed, restoredSavedAt]);

  // The rep cleared a submitted entry to start another: that one gets its own
  // key (React's "adjust state when a prop changes" pattern, during render).
  if (keyUsed && !hasDraftContent(formData, products, proofPaths)) {
    setKeyUsed(false);
    setProofUploadId(newClientSaleId());
    setDuplicateOf(null);
  }

  // Bring a server or offline error into view — on a phone the rep is at the
  // bottom of a long form and would otherwise never see why nothing happened.
  const shownServerError = serverErrorHidden ? '' : serverError || '';
  const blockError = formError || shownServerError;
  useEffect(() => {
    if (blockError) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [blockError]);

  // After a failed submit, take the rep to the first invalid field in the
  // order it appears on screen, whatever the form's layout.
  useEffect(() => {
    if (attempt === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.focus({ preventScroll: true });
  }, [attempt]);

  const clearError = useCallback((key: SaleFieldKey) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setField = useCallback(
    (name: keyof SaleFormFields, value: string) => {
      if (name === 'saleDate') {
        setSaleDateTouched(true);
        setSaleDateFromInstall(false);
        setFormData((prev) => ({ ...prev, saleDate: value }));
        clearError('saleDate');
        return;
      }

      // An install that already happened means the sale happened by then too —
      // an install never precedes its sale — so date the sale to it. Same rule
      // the server applies when no sale date is sent. A today or future install
      // is the normal "sold now, installs later" case and leaves the sale on today.
      if (name === 'installDate' && !saleDateTouched) {
        const backdated = isBeforeToday(value);
        setSaleDateFromInstall(backdated);
        setFormData((prev) => ({
          ...prev,
          installDate: value,
          saleDate: backdated ? value : todaySaleDateInput(),
        }));
        clearError('installDate');
        clearError('saleDate');
        return;
      }

      setFormData((prev) => ({ ...prev, [name]: value }));
      if (name === 'customerAddress' || name === 'installDate' || name === 'orderNumberOrBtn') {
        clearError(name);
      }
      if (name === 'installDate') clearError('saleDate');
    },
    [clearError, saleDateTouched]
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setField(e.target.name as keyof SaleFormFields, e.target.value);

  const addPlan = useCallback(
    (plan: FiberPlan) => {
      // One internet plan per sale — picking a second one swaps, it does not
      // add. See src/lib/sales/planSelection.ts for why.
      setProducts((prev) => addPlanToProducts(prev, plan));
      clearError('plan');
      setFormError('');
    },
    [clearError]
  );

  const removeProduct = useCallback((index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Add or remove an extra (an add-on such as Xfinity TV); extras stack. */
  const toggleExtra = useCallback((plan: FiberPlan) => {
    setProducts((prev) =>
      prev.some((p) => p.productId === plan.id)
        ? prev.filter((p) => p.productId !== plan.id)
        : addPlanToProducts(prev, plan)
    );
  }, []);

  /**
   * A sale is with one provider: switching drops every product from the old
   * one (its plan and any extras) instead of leaving a mixed sale behind.
   */
  const keepProvider = useCallback((company: string) => {
    setProducts((prev) => {
      const kept = prev.filter((p) => p.company === company);
      return kept.length === prev.length ? prev : kept;
    });
  }, []);

  const addProofPath = useCallback(
    (path: string) => {
      setProofPathsState((prev) =>
        prev.includes(path) || prev.length >= MAX_PROOF_SCREENSHOTS ? prev : [...prev, path]
      );
      clearError('orderNumberOrBtn');
    },
    [clearError]
  );

  const removeProofPath = useCallback((path: string) => {
    setProofPathsState((prev) => prev.filter((p) => p !== path));
  }, []);

  /** Replace the whole list (the single-upload SaleForm swaps its one file). */
  const setProofPaths = useCallback(
    (paths: string[]) => {
      setProofPathsState(paths.slice(0, MAX_PROOF_SCREENSHOTS));
      if (paths.length > 0) clearError('orderNumberOrBtn');
    },
    [clearError]
  );

  const totals = useMemo(
    () => ({
      value: products.reduce((sum, p) => sum + p.totalPrice, 0),
      points: products.reduce((sum, p) => sum + p.points, 0),
    }),
    [products]
  );
  const productSold = products.map((p) => p.productName).join(', ');

  /**
   * Validate and create the sale. Resolves to the result, or null when a field,
   * the network or the server said no (the reason is in `errors`, `formError`
   * or `serverError`). The draft is cleared once the sale is stored. A
   * `duplicate` that is the entry on screen (a retry whose first answer was
   * lost, see `isSameSaleEntry`) is that success and comes back as a plain,
   * non-duplicate result. Any other `duplicate` is held in `duplicateOf` for
   * the page to show, and the draft stays, since the entry is a different
   * customer (see `logAsNew`).
   */
  const submit = async (
    options: { pendingUploads?: number; clientSaleId?: string } = {}
  ): Promise<CreateSaleResult | null> => {
    setFormError('');
    setServerErrorHidden(false);
    setDuplicateOf(null);
    const nextErrors = validateSaleForm({ formData, products, proofPaths });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setAttempt((n) => n + 1);
      return null;
    }
    if (options.pendingUploads) {
      setFormError('A screenshot is still uploading. Submit once it is done, or cancel it.');
      return null;
    }
    if (!user) {
      setFormError('You must be logged in to submit a sale');
      return null;
    }

    const saleData = {
      ...formData,
      ...proofPathFields(proofPaths),
      productSold,
      salesRepId: user.uid,
      salesRepName: user.displayName || user.email || '',
      managerId: user.reportsToId,
      products,
      // The server re-prices products from the catalog; these are the preview.
      totalValue: totals.value,
      totalPoints: totals.points,
      clientSaleId: options.clientSaleId ?? proofUploadId,
    };

    // From here the key may name a stored sale, even if no answer comes back.
    setKeyUsed(true);
    const created = await createSale(saleData);
    // The sale on screen already landed (its first answer was lost): logged.
    const result =
      created?.duplicate && isSameSaleEntry(created.sale, { formData, products })
        ? { ...created, duplicate: false }
        : created;
    if (result?.duplicate) {
      setDuplicateOf(result.sale);
    } else if (result) {
      submittedRef.current = true;
      if (draftKey) writeSaleDraft(draftKey, null);
      // Confirmed: whatever is entered next is a new sale with a new key.
      setProofUploadId(newClientSaleId());
      setKeyUsed(false);
    }
    return result;
  };

  /**
   * The rep says the entry on screen is NOT the sale that came back as a
   * duplicate: give it a new key and submit it as its own sale.
   */
  const logAsNew = async (options: { pendingUploads?: number } = {}) => {
    const fresh = newClientSaleId();
    setProofUploadId(fresh);
    return submit({ ...options, clientSaleId: fresh });
  };

  /** The entry was already logged (the duplicate): drop the saved draft. */
  const discardDraft = () => {
    submittedRef.current = true;
    if (draftKey) writeSaleDraft(draftKey, null);
  };

  /**
   * Throw the entry away and start a new sale: every field, the plan and
   * extras, the proof paths and both dates go, the saved draft is removed, and
   * the sale gets a fresh key, so nothing entered next can land on a sale the
   * old key may already name. The page cancels its own uploads in flight.
   */
  const startOver = () => {
    setFormData(emptyFields());
    setProducts([]);
    setProofPathsState([]);
    setSaleDateTouched(false);
    setSaleDateFromInstall(false);
    setErrors({});
    setFormError('');
    setServerErrorHidden(true);
    setDuplicateOf(null);
    setProofUploadId(newClientSaleId());
    setKeyUsed(false);
    setFromDraft(false);
    setRestoredSavedAt(undefined);
    if (draftKey) writeSaleDraft(draftKey, null);
  };

  const provider =
    products.find((p) => !isExtraPlanId(p.productId))?.company ?? products[0]?.company ?? null;

  return {
    formData,
    setField,
    handleChange,
    products,
    provider,
    addPlan,
    removeProduct,
    toggleExtra,
    keepProvider,
    proofPaths,
    addProofPath,
    removeProofPath,
    setProofPaths,
    proofUploadId,
    saleDateFromInstall,
    errors,
    formError,
    serverError: shownServerError,
    blockError,
    submitting: loading,
    submit,
    logAsNew,
    duplicateOf,
    discardDraft,
    startOver,
    hasContent: hasDraftContent(formData, products, proofPaths),
    totals,
    productSold,
    draftRestored,
    fromDraft,
    formRef,
    errorRef,
  };
}

export type SaleFormState = ReturnType<typeof useSaleFormState>;
