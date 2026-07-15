'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Lock, Trash2, TriangleAlert } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sale,
  FiberPlan,
  SaleType,
  SaleProduct,
  SALE_TYPES,
} from '@/types';
import { PlanPicker } from '@/components/sales/PlanPicker';
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { hasSaleProof } from '@/lib/sales/proof';
import { dateToSaleDateInput, todaySaleDateInput } from '@/lib/sales/saleDate';
import { auth } from '@/lib/firebase/config';

function dateLabel() {
  const now = new Date();
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now).toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase(),
  };
}

function Mast() {
  const { month, weekday } = dateLabel();
  return (
    <div className="sales-line-mast">
      <span className="sales-line-mark">3C WORLD GROUP / THE LINE / SALES</span>
      <span className="sales-line-mast-meta">{month} · {weekday}</span>
    </div>
  );
}

function SalesLineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="sales-line-main flex-1 overflow-auto">
          <div className="sales-line">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function EditSalePage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const { fetchSale, updateSale, loading, error } = useSales();

  const [sale, setSale] = useState<Sale | null>(null);
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
  });
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [proofUploadId] = useState(() => crypto.randomUUID().replace(/-/g, ''));

  const isAdmin = isRole('admin');
  const saleId = params.id as string;

  useEffect(() => {
    async function loadSale() {
      const saleData = await fetchSale(saleId);
      if (saleData) {
        setSale(saleData);
        setFormData({
          customerName: saleData.customerName || '',
          customerPhone: saleData.customerPhone || '',
          customerEmail: saleData.customerEmail || '',
          customerAddress: saleData.customerAddress || '',
          saleType: saleData.saleType || 'new_service',
          saleDate: saleData.saleDate
            ? dateToSaleDateInput(new Date(saleData.saleDate))
            : todaySaleDateInput(),
          installDate: saleData.installDate
            ? dateToSaleDateInput(new Date(saleData.installDate))
            : '',
          notes: saleData.notes || '',
          orderNumberOrBtn: saleData.orderNumberOrBtn || '',
          proofScreenshotPath: saleData.proofScreenshotPath || '',
        });
        setProducts(saleData.products || []);
      }
    }
    if (saleId) {
      loadSale();
    }
  }, [saleId, fetchSale]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addPlan = (plan: FiberPlan) => {
    if (products.some((p) => p.productId === plan.id)) {
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

  const calculateTotalValue = () => products.reduce((sum, p) => sum + p.totalPrice, 0);
  const calculateTotalPoints = () => products.reduce((sum, p) => sum + p.points, 0);

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

    if (!formData.saleDate) {
      setFormError('Please select the sale date');
      return;
    }

    if (formData.saleDate > todaySaleDateInput()) {
      setFormError('Sale date cannot be in the future');
      return;
    }

    if (!hasSaleProof(formData)) {
      setFormError('Enter an order number / BTN, or upload a screenshot');
      return;
    }

    setSaving(true);

    const updates: Partial<Omit<Sale, 'saleDate' | 'installDate'>> & {
      saleDate?: string;
      installDate?: string;
    } = {
      ...formData,
      productSold: products.map((p) => p.productName).join(', '),
      products,
      totalValue: calculateTotalValue(),
      totalPoints: calculateTotalPoints(),
    };

    const success = await updateSale(saleId, updates);
    if (success) {
      router.push(`/portal/sales/${saleId}`);
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <SalesLineShell>
          <Mast />
          <div className="sales-line-state-panel">
            <Lock className="sales-line-icon-lg" aria-hidden="true" />
            <strong>Access Denied</strong>
            <p>Only admins can edit sales.</p>
            <Link className="sales-line-btn primary" href="/portal/sales">Back to Sales</Link>
          </div>
        </SalesLineShell>
      </ProtectedRoute>
    );
  }

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <SalesLineShell>
          <Mast />
          <div className="sales-line-state-panel">
            <div className="sales-line-spinner" aria-hidden="true" />
            <p>Loading sale...</p>
          </div>
        </SalesLineShell>
      </ProtectedRoute>
    );
  }

  if (!sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <SalesLineShell>
          <Mast />
          <div className="sales-line-state-panel">
            <TriangleAlert className="sales-line-icon-lg" aria-hidden="true" />
            <strong>Sale not found</strong>
            <Link className="sales-line-btn primary" href="/portal/sales">Back to Sales</Link>
          </div>
        </SalesLineShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <SalesLineShell>
        <Mast />

        <Link className="sales-line-back" href={`/portal/sales/${saleId}`}>
          <ArrowLeft className="sales-line-icon" aria-hidden="true" />
          Back to sale details
        </Link>

        <header className="sales-line-subhead">
          <div>
            <p className="sales-line-eyebrow">Sales workspace / edit</p>
            <h1>Edit Sale</h1>
            <p className="sales-line-subhead-id">ID: {sale.id}</p>
          </div>
        </header>

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
                        <button type="button" className="sales-line-remove-plan" onClick={() => removeProduct(index)} aria-label="Remove plan">
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
                  <label className="sales-line-field-label" htmlFor="installDate">Install date</label>
                  <input id="installDate" className="sales-line-input" type="date" name="installDate" value={formData.installDate} onChange={handleChange} />
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
            <Link className="sales-line-btn" href={`/portal/sales/${saleId}`}>Cancel</Link>
            <button
              type="submit"
              className="sales-line-btn primary"
              disabled={saving || products.length === 0 || !formData.customerAddress.trim()}
            >
              {saving ? 'Saving...' : <><Check className="sales-line-icon" aria-hidden="true" />Save changes</>}
            </button>
          </div>
        </form>
      </SalesLineShell>
    </ProtectedRoute>
  );
}
