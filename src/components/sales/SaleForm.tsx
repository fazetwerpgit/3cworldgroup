'use client';

import { useRouter } from 'next/navigation';
import { Check, Trash2 } from 'lucide-react';
import { SALE_TYPES } from '@/types';
import { PlanPicker } from '@/components/sales/PlanPicker';
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import { useSaleFormState } from '@/hooks/useSaleFormState';
import { auth } from '@/lib/firebase/config';

interface SaleFormProps {
  onSuccess?: () => void;
}

// The pre-D new-sale form. Its state, draft, validation and submit live in
// useSaleFormState, shared with the direction-D Log Sale page
// (components/portal/rep/RepLogSale.tsx); this is markup only.
export function SaleForm({ onSuccess }: SaleFormProps) {
  const router = useRouter();
  const { formRef, errorRef, ...form } = useSaleFormState();
  const {
    formData,
    handleChange,
    products,
    addPlan,
    removeProduct,
    proofPaths,
    setProofPaths,
    proofUploadId,
    saleDateFromInstall,
    errors,
    submitting: loading,
    totals,
  } = form;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await form.submit();
    // A duplicate is a sale already logged under this entry, not a new one.
    if (!result || result.duplicate) return;
    if (onSuccess) onSuccess();
    else router.push('/portal/sales');
  };

  // One message at a time, as before: the first field error, else the block error.
  const firstFieldError = Object.values(errors)[0];
  const shownError =
    firstFieldError || form.blockError || (form.duplicateOf ? 'This sale was already logged.' : '');
  const invalid = (key: keyof typeof errors) => (errors[key] ? true : undefined);

  const productSoldPreview = products.map((p) => p.productName).join(', ');

  const missingAddress = !formData.customerAddress.trim();
  const missingPlan = products.length === 0;
  const submitHint =
    missingAddress && missingPlan
      ? 'Add the installation address and pick a plan to submit.'
      : missingAddress
        ? 'Add the installation address to submit.'
        : missingPlan
          ? 'Pick a plan to submit.'
          : '';

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="sales-line-form">

      <section className="sales-line-panel">
        <div className="sales-line-panel-head">
          <h2>Customer address</h2>
        </div>
        <div className="sales-line-panel-body">
          <label className="sales-line-field-label" htmlFor="customerAddress">
            Installation address <span className="req">*</span>
          </label>
          <input
            id="customerAddress"
            className="sales-line-input"
            type="text"
            name="customerAddress"
            value={formData.customerAddress}
            onChange={handleChange}
            required
            aria-invalid={invalid('customerAddress')}
            placeholder="123 Main St, City, State 12345"
          />
          <p className="sales-line-field-hint">Enter the full address where service will be installed</p>
        </div>
      </section>

      <section className="sales-line-panel">
        <div className="sales-line-panel-head">
          <h2>Customer information</h2>
        </div>
        <div className="sales-line-panel-body">
          <div className="sales-line-field-grid cols-3">
            <div>
              <label className="sales-line-field-label" htmlFor="customerName">Customer name</label>
              <input id="customerName" className="sales-line-input" type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="John Smith" />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="customerPhone">Phone number</label>
              <input id="customerPhone" className="sales-line-input" type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="customerEmail">Email</label>
              <input id="customerEmail" className="sales-line-input" type="email" name="customerEmail" value={formData.customerEmail} onChange={handleChange} placeholder="customer@email.com" />
            </div>
          </div>
        </div>
      </section>

      <section className="sales-line-panel">
        <div className="sales-line-panel-head">
          <h2>Select plan</h2>
        </div>
        <div className="sales-line-panel-body">
          <PlanPicker products={products} onAdd={addPlan} />

          {products.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="sales-line-field-label">Selected plans</label>
              <div className="sales-line-selected-plans">
                {products.map((product, index) => (
                  <div key={index} className="sales-line-selected-plan-row">
                    <div>
                      <strong>{product.productName}</strong>
                      <span>${product.unitPrice.toFixed(2)}/mo · +{product.points} pts</span>
                    </div>
                    <button
                      type="button"
                      className="sales-line-remove-plan"
                      onClick={() => removeProduct(index)}
                      aria-label="Remove plan"
                    >
                      <Trash2 className="sales-line-icon" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="sales-line-panel">
        <div className="sales-line-panel-head">
          <h2>Sale details</h2>
        </div>
        <div className="sales-line-panel-body">
          <div className="sales-line-field-grid">
            <div>
              <label className="sales-line-field-label" htmlFor="saleType">Sale type</label>
              <select id="saleType" className="sales-line-select" name="saleType" value={formData.saleType} onChange={handleChange}>
                {SALE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="saleDate">Sale date <span className="req">*</span></label>
              <input id="saleDate" className="sales-line-input" type="date" name="saleDate" value={formData.saleDate} onChange={handleChange} max={todaySaleDateInput()} required aria-invalid={invalid('saleDate')} />
              <p className="sales-line-field-hint">
                {saleDateFromInstall
                  ? 'Dated to the install day — change it if the sale happened earlier.'
                  : 'The day the customer signed up, not the install day.'}
              </p>
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="installDate">Install date <span className="req">*</span></label>
              <input id="installDate" className="sales-line-input" type="date" name="installDate" value={formData.installDate} onChange={handleChange} required aria-invalid={invalid('installDate')} />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="orderNumberOrBtn">Order number or BTN</label>
              <input id="orderNumberOrBtn" className="sales-line-input" type="text" name="orderNumberOrBtn" value={formData.orderNumberOrBtn} onChange={handleChange} aria-invalid={invalid('orderNumberOrBtn')} placeholder="Order # or billing phone number" />
              <p className="sales-line-field-hint">Required unless you upload a screenshot below.</p>
            </div>
            <div>
              <label className="sales-line-field-label">Screenshot (if no order # / BTN)</label>
              <div className="sales-line-upload-frame">
                <FileUpload
                  itemId="sale-proof"
                  slot={proofUploadId}
                  accept="image/*,application/pdf"
                  allowedTypes={FORM_ATTACHMENT_TYPES}
                  uploadUrl="/api/portal/forms/upload"
                  extraFields={{ formType: 'sale-proof' }}
                  existingPath={proofPaths[0]}
                  getHeaders={async (): Promise<HeadersInit> => {
                    const t = await auth?.currentUser?.getIdToken();
                    return t ? { Authorization: `Bearer ${t}` } : {};
                  }}
                  onUploaded={(path) => setProofPaths([path])}
                />
              </div>
            </div>
            <div className="span-2">
              <label className="sales-line-field-label" htmlFor="notes">Notes</label>
              <input id="notes" className="sales-line-input" type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional context for review" />
            </div>
          </div>
        </div>
      </section>

      {products.length > 0 && (
        <div className="sales-line-summary-bar">
          <div className="sales-line-summary-stats">
            <div><small>Monthly value</small><strong>${totals.value.toFixed(2)}/mo</strong></div>
            <div><small>Plans</small><strong>{products.length}</strong></div>
            <div><small>Points</small><strong>+{totals.points}</strong></div>
          </div>
          <div className="sales-line-auto-product">
            <b>Product sold (auto):</b> <span className="val">{productSoldPreview || '—'}</span>
          </div>
        </div>
      )}

      {shownError && (
        <div ref={errorRef} className="sales-line-error sales-line-submit-error" role="alert">
          {shownError}
        </div>
      )}

      {!loading && submitHint && (
        <p className="sales-line-submit-hint">{submitHint}</p>
      )}

      <div className="sales-line-form-actions">
        <button type="button" className="sales-line-btn" onClick={() => router.back()}>
          Cancel
        </button>
        <button
          type="submit"
          className="sales-line-btn primary"
          disabled={loading || missingPlan || missingAddress}
        >
          {loading ? 'Submitting...' : <><Check className="sales-line-icon" aria-hidden="true" />Submit sale</>}
        </button>
      </div>
    </form>
  );
}
