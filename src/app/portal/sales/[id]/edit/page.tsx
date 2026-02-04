'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sale,
  SaleType,
  SaleStatus,
  SaleProduct,
  FiberCompany,
  SALE_TYPES,
  FIBER_COMPANIES,
  getPlansByCompany,
  getPlanById,
} from '@/types';

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
    status: 'pending' as SaleStatus,
    notes: '',
  });
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<FiberCompany | ''>('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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
          status: saleData.status || 'pending',
          notes: saleData.notes || '',
        });
        setProducts(saleData.products || []);
        if (saleData.products?.length > 0) {
          setSelectedCompany(saleData.products[0].company as FiberCompany);
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

  const handleCompanyChange = (company: FiberCompany) => {
    setSelectedCompany(company);
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

    setSaving(true);

    const updates: Partial<Sale> = {
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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold">Access Denied</p>
            <p className="text-gray-500 mt-1">Only admins can edit sales.</p>
            <Link
              href="/portal/sales"
              className="inline-block mt-4 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e]"
            >
              Back to Sales
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading sale...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-900 font-semibold">Sale not found</p>
            <Link
              href="/portal/sales"
              className="inline-block mt-4 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e]"
            >
              Back to Sales
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link
              href={`/portal/sales/${saleId}`}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[#0A1F44]">Edit Sale</h1>
              <p className="text-gray-500 text-sm">ID: {sale.id}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {(formError || error) && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {formError || error}
              </div>
            )}

            {/* Status (Admin only) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-[#0A1F44] mb-4 flex items-center gap-2">
                <span className="text-xl">⚙️</span> Sale Status
              </h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Customer Address */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">Customer Address</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Installation Address *
                </label>
                <input
                  type="text"
                  name="customerAddress"
                  value={formData.customerAddress}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                  placeholder="123 Main St, City, State 12345"
                />
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">
                Customer Information <span className="text-sm font-normal text-gray-400">(Optional)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    name="customerPhone"
                    value={formData.customerPhone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="customerEmail"
                    value={formData.customerEmail}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    placeholder="customer@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Company & Plan Selection */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">Select Plan</h2>

              {/* Company Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Choose Provider</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FIBER_COMPANIES.map((company) => (
                    <button
                      key={company.value}
                      type="button"
                      onClick={() => handleCompanyChange(company.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedCompany === company.value
                          ? 'border-[#8dc63f] bg-[#8dc63f]/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span
                        className={`font-semibold ${
                          selectedCompany === company.value ? 'text-[#8dc63f]' : 'text-gray-900'
                        }`}
                      >
                        {company.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Selection */}
              {selectedCompany && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Choose Plan</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availablePlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => addPlan(plan.id)}
                        disabled={products.some((p) => p.productId === plan.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          products.some((p) => p.productId === plan.id)
                            ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                            : 'border-gray-200 hover:border-[#8dc63f] hover:bg-[#8dc63f]/5'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold text-gray-900 block">{plan.name}</span>
                            <span className="text-sm text-gray-500">{plan.speed}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-[#0A1F44]">${plan.price.toFixed(2)}</span>
                            <span className="text-xs text-gray-500 block">/month</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-xs bg-[#8dc63f]/10 text-[#8dc63f] px-2 py-0.5 rounded-full font-medium">
                            +{plan.points} pts
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Plans */}
              {products.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Selected Plans</label>
                  <div className="space-y-2">
                    {products.map((product, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <span className="font-medium text-gray-900">{product.productName}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-gray-500">${product.unitPrice.toFixed(2)}/mo</span>
                            <span className="text-xs bg-[#8dc63f]/10 text-[#8dc63f] px-2 py-0.5 rounded-full font-medium">
                              +{product.points} pts
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProduct(index)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sale Type & Notes */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">Sale Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sale Type</label>
                  <select
                    name="saleType"
                    value={formData.saleType}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                  >
                    {SALE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            {products.length > 0 && (
              <div className="bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] rounded-xl p-6 text-white">
                <h2 className="text-lg font-semibold mb-4">Sale Summary</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-white/70">Monthly Value</span>
                    <span className="font-semibold">${calculateTotalValue().toFixed(2)}/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Plans Selected</span>
                    <span className="font-semibold">{products.length}</span>
                  </div>
                  <div className="border-t border-white/20 pt-3 flex justify-between items-center">
                    <span className="text-white/70">Points</span>
                    <span className="text-2xl font-bold text-[#8dc63f]">+{calculateTotalPoints()} pts</span>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Link
                href={`/portal/sales/${saleId}`}
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving || products.length === 0 || !formData.customerAddress.trim()}
                className="px-8 py-3 bg-[#8dc63f] text-white rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
