'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import {
  SaleType,
  SaleProduct,
  SALE_TYPES,
  FIBER_COMPANIES,
  getPlansByCompany,
  getPlanById
} from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { hasSaleProof } from '@/lib/sales/proof';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import { auth } from '@/lib/firebase/config';

interface SaleFormProps {
  onSuccess?: () => void;
}

export function SaleForm({ onSuccess }: SaleFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { createSale, loading, error } = useSales();

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    saleType: 'new_service' as SaleType,
    saleDate: todaySaleDateInput(),
    installDate: '',
    notes: '',
    orderNumberOrBtn: '',
    proofScreenshotPath: '',
    productSold: '',
  });
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [formError, setFormError] = useState('');
  const [proofUploadId] = useState(() => crypto.randomUUID().replace(/-/g, ''));

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCompanyChange = (company: string) => {
    setSelectedCompany(company);
  };

  const addPlan = (planId: string) => {
    const plan = getPlanById(planId);
    if (!plan) return;

    // Check if plan already added
    if (products.some(p => p.productId === planId)) {
      setFormError('This plan is already added');
      return;
    }

    setProducts((prev) => [
      ...prev,
      {
        productId: plan.id,
        productName: `${plan.name} (${plan.speed})`,
        company: plan.company,
        quantity: 1,
        unitPrice: plan.price,
        totalPrice: plan.price,
        points: plan.points,
      },
    ]);
    setFormError('');
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateTotalValue = () => {
    return products.reduce((sum, p) => sum + p.totalPrice, 0);
  };

  const calculateTotalPoints = () => {
    return products.reduce((sum, p) => sum + p.points, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.customerAddress.trim()) {
      setFormError('Please enter the customer address');
      return;
    }

    if (products.length === 0) {
      setFormError('Please add at least one plan');
      return;
    }

    if (!formData.productSold.trim()) {
      setFormError('Please enter the product sold');
      return;
    }

    if (!formData.saleDate) {
      setFormError('Please select the sale date');
      return;
    }

    if (formData.saleDate > todaySaleDateInput()) {
      setFormError('Sale date cannot be in the future');
      return;
    }

    if (!formData.installDate) {
      setFormError('Please select the install date');
      return;
    }

    if (!hasSaleProof(formData)) {
      setFormError('Enter an order number / BTN, or upload a screenshot');
      return;
    }

    if (!user) {
      setFormError('You must be logged in to submit a sale');
      return;
    }

    const saleData = {
      ...formData,
      salesRepId: user.uid,
      salesRepName: user.displayName || user.email || '',
      managerId: user.reportsToId,
      products,
      totalValue: calculateTotalValue(),
      totalPoints: calculateTotalPoints(),
    };

    const result = await createSale(saleData);
    if (result) {
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/portal/sales');
      }
    }
  };

  const availablePlans = selectedCompany ? getPlansByCompany(selectedCompany) : [];

  return (
    <form onSubmit={handleSubmit} className="sales-line-form">
      {(formError || error) && (
        <div className="sales-line-error" role="alert">{formError || error}</div>
      )}

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
          <label className="sales-line-field-label">Choose provider</label>
          <div className="sales-line-provider-grid">
            {FIBER_COMPANIES.map((company) => (
              <button
                key={company.value}
                type="button"
                onClick={() => handleCompanyChange(company.value)}
                className={`sales-line-pick ${selectedCompany === company.value ? 'selected' : ''}`}
              >
                <span>{company.label}</span>
              </button>
            ))}
          </div>

          {selectedCompany && (
            <div style={{ marginTop: 16 }}>
              <label className="sales-line-field-label">Choose plan</label>
              <div className="sales-line-plan-grid">
                {availablePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => addPlan(plan.id)}
                    disabled={products.some(p => p.productId === plan.id)}
                    className="sales-line-pick sales-line-plan-pick"
                  >
                    <div className="sales-line-plan-pick-copy">
                      <strong>{plan.name}</strong>
                      <small>{plan.speed}</small>
                    </div>
                    <div className="sales-line-plan-pick-price">
                      <b>${plan.price.toFixed(2)}/mo</b>
                      <em>+{plan.points} pts</em>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

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
              <input id="saleDate" className="sales-line-input" type="date" name="saleDate" value={formData.saleDate} onChange={handleChange} max={todaySaleDateInput()} required />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="installDate">Install date <span className="req">*</span></label>
              <input id="installDate" className="sales-line-input" type="date" name="installDate" value={formData.installDate} onChange={handleChange} required />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="productSold">Product sold <span className="req">*</span></label>
              <input id="productSold" className="sales-line-input" type="text" name="productSold" value={formData.productSold} onChange={handleChange} placeholder="e.g. AT&T Fiber 1 Gig, DirecTV Choice" />
            </div>
            <div>
              <label className="sales-line-field-label" htmlFor="orderNumberOrBtn">Order number or BTN</label>
              <input id="orderNumberOrBtn" className="sales-line-input" type="text" name="orderNumberOrBtn" value={formData.orderNumberOrBtn} onChange={handleChange} placeholder="Order # or billing phone number" />
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
                  existingPath={formData.proofScreenshotPath || undefined}
                  getHeaders={async (): Promise<HeadersInit> => {
                    const t = await auth?.currentUser?.getIdToken();
                    return t ? { Authorization: `Bearer ${t}` } : {};
                  }}
                  onUploaded={(path) => setFormData((p) => ({ ...p, proofScreenshotPath: path }))}
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
        <section className="sales-line-panel">
          <div className="sales-line-panel-head">
            <h2>Sale summary</h2>
          </div>
          <div className="sales-line-panel-body">
            <div className="sales-line-summary">
              <div><small>Monthly value</small><strong>${calculateTotalValue().toFixed(2)}/mo</strong></div>
              <div><small>Plans selected</small><strong>{products.length}</strong></div>
              <div><small>Points</small><strong>+{calculateTotalPoints()} pts</strong></div>
            </div>
          </div>
        </section>
      )}

      <div className="sales-line-form-actions">
        <button type="button" className="sales-line-btn" onClick={() => router.back()}>
          Cancel
        </button>
        <button
          type="submit"
          className="sales-line-btn primary"
          disabled={loading || products.length === 0 || !formData.customerAddress.trim()}
        >
          {loading ? 'Submitting...' : <><Check className="sales-line-icon" aria-hidden="true" />Submit sale</>}
        </button>
      </div>
    </form>
  );
}
