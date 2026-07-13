'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Lock, Trash2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sale,
  SaleType,
  SaleProduct,
  SALE_TYPES,
  FIBER_COMPANIES,
  getPlansByCompany,
  getPlanById,
} from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { hasSaleProof } from '@/lib/sales/proof';
import { dateToSaleDateInput, todaySaleDateInput } from '@/lib/sales/saleDate';
import { auth } from '@/lib/firebase/config';

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
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
    productSold: '',
  });
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
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
          productSold: saleData.productSold || '',
        });
        setProducts(saleData.products || []);
        if (saleData.products?.length > 0) {
          setSelectedCompany(saleData.products[0].company);
        }
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

  const addPlan = (planId: string) => {
    const plan = getPlanById(planId);
    if (!plan) return;

    if (products.some((p) => p.productId === planId)) {
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

  const availablePlans = selectedCompany ? getPlansByCompany(selectedCompany) : [];

  if (!isAdmin) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <PortalShell>
          <Card className="mx-auto max-w-md rounded-lg border-slate-200 dark:border-border p-8 text-center shadow-sm">
            <Lock className="mx-auto mb-4 size-12 text-red-500" />
            <p className="font-semibold text-slate-950 dark:text-foreground">Access Denied</p>
            <p className="mt-1 text-slate-500 dark:text-muted-foreground">Only admins can edit sales.</p>
            <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/sales">Back to Sales</Link>
            </Button>
          </Card>
        </PortalShell>
      </ProtectedRoute>
    );
  }

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <PortalShell>
          <Card className="mx-auto max-w-4xl rounded-lg border-slate-200 dark:border-border p-8 text-center shadow-sm">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
            <p className="mt-4 text-slate-500 dark:text-muted-foreground">Loading sale...</p>
          </Card>
        </PortalShell>
      </ProtectedRoute>
    );
  }

  if (!sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <PortalShell>
          <Card className="mx-auto max-w-md rounded-lg border-slate-200 dark:border-border p-8 text-center shadow-sm">
            <p className="font-semibold text-slate-950 dark:text-foreground">Sale not found</p>
            <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal/sales">Back to Sales</Link>
            </Button>
          </Card>
        </PortalShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <PortalShell>
        <div className="mx-auto max-w-[1100px] space-y-5">
          <Button
            asChild
            variant="ghost"
            className="text-slate-600 dark:text-muted-foreground hover:text-slate-950 dark:hover:text-foreground"
          >
            <Link href={`/portal/sales/${saleId}`} aria-label="Back to sale details">
              <ArrowLeft className="size-4" />
              Back to sale details
            </Link>
          </Button>

          <PortalPageHeader
            compact
            eyebrow="Sales workspace"
            title="Edit Sale"
            description={`ID: ${sale.id}`}
          />

          <form onSubmit={handleSubmit} className="portal-enter portal-enter-2 space-y-6">
            {(formError || error) && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                {formError || error}
              </div>
            )}

            <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <CardTitle className="text-[#0A1F44] dark:text-foreground">Customer Address</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <Label className="mb-1">Installation Address *</Label>
                <Input
                  type="text"
                  name="customerAddress"
                  value={formData.customerAddress}
                  onChange={handleChange}
                  required
                  className="h-11"
                  placeholder="123 Main St, City, State 12345"
                />
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <CardTitle className="text-[#0A1F44] dark:text-foreground">
                  Customer Information <span className="text-sm font-normal text-slate-400 dark:text-muted-foreground">(Optional)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <Label className="mb-1">Customer Name</Label>
                    <Input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="John Smith" />
                  </div>
                  <div>
                    <Label className="mb-1">Phone Number</Label>
                    <Input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <Label className="mb-1">Email</Label>
                    <Input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleChange} placeholder="customer@email.com" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <CardTitle className="text-[#0A1F44] dark:text-foreground">Select Plan</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="mb-6">
                  <Label className="mb-3">Choose Provider</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {FIBER_COMPANIES.map((company) => (
                      <button
                        key={company.value}
                        type="button"
                        onClick={() => setSelectedCompany(company.value)}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                          selectedCompany === company.value
                            ? 'border-[#8dc63f] bg-[#8dc63f]/5 shadow-[inset_0_0_0_1px_#8dc63f]'
                            : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border hover:bg-slate-50 dark:hover:bg-muted'
                        }`}
                      >
                        <span className={`font-semibold ${selectedCompany === company.value ? 'text-[#5a8f1f]' : 'text-slate-950 dark:text-foreground'}`}>
                          {company.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCompany && (
                  <div className="mb-6">
                    <Label className="mb-3">Choose Plan</Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {availablePlans.map((plan) => {
                        const added = products.some((p) => p.productId === plan.id);
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => addPlan(plan.id)}
                            disabled={added}
                            className={`rounded-lg border p-4 text-left transition-colors ${
                              added
                                ? 'cursor-not-allowed border-slate-200 dark:border-border bg-slate-50 dark:bg-muted opacity-50'
                                : 'border-slate-200 dark:border-border hover:border-[#8dc63f] hover:bg-[#8dc63f]/5'
                            }`}
                          >
                            <div className="flex justify-between gap-4">
                              <div>
                                <span className="block font-semibold text-slate-950 dark:text-foreground">{plan.name}</span>
                                <span className="text-sm text-slate-500 dark:text-muted-foreground">{plan.speed}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-[#0A1F44] dark:text-foreground">${plan.price.toFixed(2)}</span>
                                <span className="block text-xs text-gray-500 dark:text-muted-foreground">/month</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="mt-2 border-[#8dc63f]/20 bg-[#8dc63f]/10 text-[#5a8f1f]">
                              +{plan.points} pts
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {products.length > 0 && (
                  <div>
                    <Label className="mb-3">Selected Plans</Label>
                    <div className="space-y-2">
                      {products.map((product, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4">
                          <div>
                            <span className="font-medium text-slate-950 dark:text-foreground">{product.productName}</span>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-sm text-gray-500 dark:text-muted-foreground">${product.unitPrice.toFixed(2)}/mo</span>
                              <Badge variant="outline" className="border-[#8dc63f]/20 bg-[#8dc63f]/10 text-[#5a8f1f]">
                                +{product.points} pts
                              </Badge>
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeProduct(index)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-800 dark:hover:text-red-300">
                            <Trash2 className="size-4" />
                            <span className="sr-only">Remove plan</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 dark:border-border py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <CardTitle className="text-[#0A1F44] dark:text-foreground">Sale Details</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-1">Sale Type</Label>
                    <NativeSelect name="saleType" value={formData.saleType} onChange={handleChange} className="min-w-full">
                      {SALE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div>
                    <Label className="mb-1">Sale Date *</Label>
                    <Input
                      type="date"
                      name="saleDate"
                      value={formData.saleDate}
                      onChange={handleChange}
                      max={todaySaleDateInput()}
                      required
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Install Date</Label>
                    <Input
                      type="date"
                      name="installDate"
                      value={formData.installDate}
                      onChange={handleChange}
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Product Sold *</Label>
                    <Input
                      type="text"
                      name="productSold"
                      value={formData.productSold}
                      onChange={handleChange}
                      placeholder="e.g. AT&T Fiber 1 Gig, DirecTV Choice"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Order Number or BTN</Label>
                    <Input
                      type="text"
                      name="orderNumberOrBtn"
                      value={formData.orderNumberOrBtn}
                      onChange={handleChange}
                      placeholder="Order # or billing phone number"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                      Required unless you upload a screenshot below.
                    </p>
                  </div>
                  <div>
                    <Label className="mb-1">Screenshot (if no order # / BTN)</Label>
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
                  <div className="md:col-span-2">
                    <Label className="mb-1">Notes</Label>
                    <Input type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional context for review" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {products.length > 0 && (
              <Card className="rounded-lg border-[#0A1F44]/10 bg-[#0A1F44] py-0 text-white shadow-sm">
                <CardHeader>
                  <CardTitle>Sale Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase text-white/60">Monthly Value</p>
                      <p className="text-xl font-semibold">${calculateTotalValue().toFixed(2)}/mo</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-white/60">Plans Selected</p>
                      <p className="text-xl font-semibold">{products.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-white/60">Points</p>
                      <p className="text-xl font-semibold text-[#8dc63f]">+{calculateTotalPoints()} pts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-4">
              <Button asChild variant="outline">
                <Link href={`/portal/sales/${saleId}`}>Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={saving || products.length === 0 || !formData.customerAddress.trim()}
                className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
              >
                {saving ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </PortalShell>
    </ProtectedRoute>
  );
}
