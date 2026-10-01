'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Lock, Trash2, TriangleAlert } from 'lucide-react';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { SALE_TYPES, type FiberPlan, type Sale, type SaleProduct, type SaleType } from '@/types';
import { hasSaleProof } from '@/lib/sales/proof';
import { MAX_PROOF_SCREENSHOTS, saleProofPaths } from '@/lib/sales/proofPaths';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import { randomHex } from '@/lib/randomHex';
import { dateToSaleDateInput, todaySaleDateInput } from '@/lib/sales/saleDate';
import { BodyLayer } from './BodyLayer';
import { ProofCapture, useProofUploads } from './ProofCapture';
import { RepPlanPicker } from './RepPlanPicker';
import { useSoftKeyboardOpen } from './RepForm';
import { useHideRepTabBar } from './RepShell';
import { formatPrice, num } from './saleFormat';
import s from './rep.module.css';
import x from './rep-sale.module.css';

const FORM_ID = 'edit-sale-form';

function EditSkeleton() {
  return (
    <div className={x.page} aria-busy="true" aria-label="Loading sale">
      <span className={`${s.skel} ${x.skelTitle}`} />
      {[0, 1, 2].map((item) => (
        <section key={item} className={s.panel}>
          <div className={x.skelBody}>
            <span className={`${s.skel} ${x.skelLineShort}`} />
            <span className={`${s.skel} ${x.skelLine}`} />
            <span className={`${s.skel} ${x.skelLine}`} />
          </div>
        </section>
      ))}
    </div>
  );
}

function Blocked({ icon, title, text, href, link }: { icon: React.ReactNode; title: string; text: string; href: string; link: string }) {
  return (
    <div className={x.page}>
      <section className={`${s.panel} ${x.empty}`}>
        {icon}
        <h1>{title}</h1>
        <p>{text}</p>
        <Link href={href} className={s.btnSecondary}>
          {link}
        </Link>
      </section>
    </div>
  );
}

export function RepSaleEdit() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const { fetchSale, updateSale, error } = useSales();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loaded, setLoaded] = useState(false);
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
    proofScreenshotPaths: [] as string[],
  });
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // The upload route clears a slot's folder before writing, so every screenshot
  // gets its own slot (see useProofUploads): this id only namespaces them.
  const [proofUploadId] = useState(() => randomHex());

  const isAdmin = isRole('admin');
  const saleId = params.id as string;
  const keyboardOpen = useSoftKeyboardOpen();

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    void fetchSale(saleId).then((saleData) => {
      if (cancelled) return;
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
          proofScreenshotPaths: saleProofPaths(saleData),
        });
        setProducts(saleData.products || []);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [saleId, fetchSale]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addPlan = (plan: FiberPlan) => {
    // One internet plan per sale — picking a second one swaps, it does not add.
    // See src/lib/sales/planSelection.ts for why.
    setProducts((prev) => addPlanToProducts(prev, plan));
    setFormError('');
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const addProofScreenshot = useCallback((path: string) => {
    setFormData((prev) =>
      prev.proofScreenshotPaths.includes(path) || prev.proofScreenshotPaths.length >= MAX_PROOF_SCREENSHOTS
        ? prev
        : { ...prev, proofScreenshotPaths: [...prev.proofScreenshotPaths, path] }
    );
  }, []);

  const removeProofScreenshot = useCallback((path: string) => {
    setFormData((prev) => ({
      ...prev,
      proofScreenshotPaths: prev.proofScreenshotPaths.filter((p) => p !== path),
    }));
  }, []);

  const uploads = useProofUploads({
    paths: formData.proofScreenshotPaths,
    onAdd: addProofScreenshot,
    onRemove: removeProofScreenshot,
    slotKey: proofUploadId,
  });

  const totalValue = products.reduce((sum, p) => sum + num(p.totalPrice), 0);
  const totalPoints = products.reduce((sum, p) => sum + num(p.points), 0);

  const showForm = isAdmin && loaded && !!sale;
  // The pinned save bar takes the tab bar's place on phones.
  useHideRepTabBar(showForm);

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

    if (uploads.uploadingCount > 0) {
      setFormError('A screenshot is still uploading. Save once it finishes.');
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
      // The legacy single field mirrors the first screenshot for older readers.
      proofScreenshotPath: formData.proofScreenshotPaths[0] ?? '',
      productSold: products.map((p) => p.productName).join(', '),
      products,
      totalValue,
      totalPoints,
    };

    const success = await updateSale(saleId, updates);
    if (success) {
      router.push(`/portal/sales/${saleId}`);
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <Blocked
        icon={<Lock size={28} aria-hidden="true" color="var(--c-amber)" />}
        title="Admins only"
        text="Only admins can edit sales."
        href="/portal/sales"
        link="Back to sales"
      />
    );
  }

  if (!loaded) return <EditSkeleton />;

  if (!sale) {
    return (
      <Blocked
        icon={<TriangleAlert size={28} aria-hidden="true" color="var(--c-amber)" />}
        title="Sale not found"
        text={error || "This sale doesn't exist anymore."}
        href="/portal/sales"
        link="Back to sales"
      />
    );
  }

  const message = formError || error || '';
  const detailHref = `/portal/sales/${saleId}`;
  const cancel = (
    <Link className={s.btnSecondary} href={detailHref}>
      Cancel
    </Link>
  );
  const save = (
    <button type="submit" form={FORM_ID} className={`${s.btnPrimary} ${x.save}`} disabled={saving}>
      {saving ? 'Saving…' : 'Save changes'}
    </button>
  );

  return (
    <div className={x.editPage}>
      <Link href={detailHref} className={`${x.back} ${s.deskOnly}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sale
      </Link>

      <header className={x.head}>
        <h1 className={x.title}>Edit sale</h1>
        <p className={x.editWho}>{sale.customerName || sale.customerAddress}</p>
      </header>

      {message ? (
        <div className={x.alert} role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      <form id={FORM_ID} className={x.editBody} onSubmit={handleSubmit}>
        <div className={x.editMain}>
          <section className={s.panel} aria-labelledby="edit-customer-h">
            <div className={s.panelHead}>
              <h2 id="edit-customer-h" className={s.kicker}>
                Customer
              </h2>
            </div>
            <div className={x.fields}>
              <div className={`${x.field} ${x.wide}`}>
                <label className={x.label} htmlFor="customerAddress">
                  Install address
                  <span className={x.req}>Required</span>
                </label>
                <input
                  id="customerAddress"
                  className={x.input}
                  type="text"
                  name="customerAddress"
                  autoComplete="street-address"
                  value={formData.customerAddress}
                  onChange={handleChange}
                  required
                  placeholder="123 Main St, City, State 12345"
                />
              </div>
              <div className={x.field}>
                <label className={x.label} htmlFor="customerName">
                  Customer name
                </label>
                <input
                  id="customerName"
                  className={x.input}
                  type="text"
                  name="customerName"
                  autoComplete="off"
                  value={formData.customerName}
                  onChange={handleChange}
                  placeholder="John Smith"
                />
              </div>
              <div className={x.field}>
                <label className={x.label} htmlFor="customerPhone">
                  Phone number
                </label>
                <input
                  id="customerPhone"
                  className={x.input}
                  type="tel"
                  name="customerPhone"
                  autoComplete="off"
                  value={formData.customerPhone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className={`${x.field} ${x.wide}`}>
                <label className={x.label} htmlFor="customerEmail">
                  Email
                </label>
                <input
                  id="customerEmail"
                  className={x.input}
                  type="email"
                  name="customerEmail"
                  autoComplete="off"
                  value={formData.customerEmail}
                  onChange={handleChange}
                  placeholder="customer@email.com"
                />
              </div>
            </div>
          </section>

          <section className={s.panel} aria-labelledby="edit-plan-h">
            <div className={s.panelHead}>
              <h2 id="edit-plan-h" className={s.kicker}>
                Plan
              </h2>
            </div>
            <RepPlanPicker products={products} onAdd={addPlan} />
            {products.length > 0 ? (
              <div className={x.picker}>
                <p className={x.pickerLabel} id="selected-plans-label">
                  On this sale
                </p>
                <ul className={x.chosen} aria-labelledby="selected-plans-label">
                  {products.map((product, index) => (
                    <li key={`${product.productId}-${index}`} className={x.chosenRow}>
                      <span>
                        <span className={x.chosenName}>{product.productName || product.productId}</span>
                        <span className={x.chosenMeta}>
                          {formatPrice(product.unitPrice)}/mo · +{num(product.points)} pts
                        </span>
                      </span>
                      <button
                        type="button"
                        className={x.iconBtn}
                        onClick={() => removeProduct(index)}
                        aria-label={`Remove ${product.productName || 'plan'}`}
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className={s.panel} aria-labelledby="edit-sale-h">
            <div className={s.panelHead}>
              <h2 id="edit-sale-h" className={s.kicker}>
                Sale
              </h2>
            </div>
            <div className={x.fields}>
              <div className={`${x.field} ${x.wide}`}>
                <label className={x.label} htmlFor="saleType">
                  Sale type
                </label>
                <span className={x.selectWrap}>
                  <select
                    id="saleType"
                    className={x.input}
                    name="saleType"
                    value={formData.saleType}
                    onChange={handleChange}
                  >
                    {SALE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={20} aria-hidden="true" />
                </span>
              </div>
              <div className={x.field}>
                <label className={x.label} htmlFor="saleDate">
                  Sale date
                  <span className={x.req}>Required</span>
                </label>
                <input
                  id="saleDate"
                  className={x.input}
                  type="date"
                  name="saleDate"
                  value={formData.saleDate}
                  onChange={handleChange}
                  max={todaySaleDateInput()}
                  required
                />
              </div>
              <div className={x.field}>
                <label className={x.label} htmlFor="installDate">
                  Install date
                </label>
                <input
                  id="installDate"
                  className={x.input}
                  type="date"
                  name="installDate"
                  value={formData.installDate}
                  onChange={handleChange}
                />
              </div>
              <div className={`${x.field} ${x.wide}`}>
                <label className={x.label} htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  className={`${x.input} ${x.textarea}`}
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Anything the office should know"
                />
              </div>
            </div>
          </section>

          <section className={s.panel} aria-labelledby="edit-order-h">
            <div className={s.panelHead}>
              <h2 id="edit-order-h" className={s.kicker}>
                Order number
              </h2>
            </div>
            <div className={x.fields}>
              <div className={`${x.field} ${x.wide}`}>
                <label className={x.label} htmlFor="orderNumberOrBtn">
                  Order number or BTN
                </label>
                <input
                  id="orderNumberOrBtn"
                  className={x.input}
                  type="text"
                  name="orderNumberOrBtn"
                  autoComplete="off"
                  value={formData.orderNumberOrBtn}
                  onChange={handleChange}
                  placeholder="Order # or billing phone number"
                />
                <p className={x.hint}>Required unless you attach a screenshot below.</p>
              </div>
            </div>
          </section>

          <ProofCapture uploads={uploads} orderRequired={!formData.orderNumberOrBtn.trim()} />
        </div>

        <aside className={x.editSide} aria-label="Summary">
          <section className={s.panel} aria-labelledby="edit-summary-h">
            <div className={s.panelHead}>
              <h2 id="edit-summary-h" className={s.kicker}>
                Summary
              </h2>
            </div>
            {products.length > 0 ? (
              <dl className={x.summary}>
                <div>
                  <dt>Monthly</dt>
                  <dd>{formatPrice(totalValue)}</dd>
                </div>
                <div>
                  <dt>Plans</dt>
                  <dd>{products.length}</dd>
                </div>
                <div>
                  <dt>Points</dt>
                  <dd>+{totalPoints}</dd>
                </div>
              </dl>
            ) : (
              <p className={`${x.hint} ${x.fields}`}>Pick a plan to see the total.</p>
            )}
            {/* Desktop, and phones with the keyboard up: in the page flow. */}
            <div className={x.saveInline} data-keyboard={keyboardOpen ? 'open' : undefined}>
              {message ? <p className={x.saveError}>{message}</p> : null}
              <div className={x.saveRow}>
                {cancel}
                {save}
              </div>
            </div>
          </section>
        </aside>
      </form>

      {/* Phones with the keyboard down: pinned in the tab bar's place. */}
      {keyboardOpen ? null : (
        <BodyLayer>
          <div className={x.saveBar}>
            {message ? (
              <p className={x.saveError} aria-hidden="true">
                {message}
              </p>
            ) : null}
            <div className={x.saveRow}>
              {cancel}
              {save}
            </div>
          </div>
        </BodyLayer>
      )}
    </div>
  );
}
