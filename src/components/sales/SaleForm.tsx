'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import {
  SaleType,
  SaleProduct,
  FiberCompany,
  SALE_TYPES,
  FIBER_COMPANIES,
  FIBER_PLANS,
  getPlansByCompany,
  getPlanById
} from '@/types';

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
    notes: '',
  });
  const [selectedCompany, setSelectedCompany] = useState<FiberCompany | ''>('');
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [formError, setFormError] = useState('');

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

    if (!user) {
      setFormError('You must be logged in to submit a sale');
      return;
    }

    const saleData = {
      ...formData,
      salesRepId: user.uid,
      salesRepName: user.displayName || user.email || '',
      managerId: user.managerId,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {(formError || error) && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {formError || error}
        </div>
      )}

      {/* Customer Address - Required */}
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
          <p className="text-xs text-gray-500 mt-1">Enter the full address where service will be installed</p>
        </div>
      </div>

      {/* Optional Customer Info */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-[#0A1F44] mb-4">Customer Information <span className="text-sm font-normal text-gray-400">(Optional)</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
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
                <span className={`font-semibold ${selectedCompany === company.value ? 'text-[#8dc63f]' : 'text-gray-900'}`}>
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
                  disabled={products.some(p => p.productId === plan.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    products.some(p => p.productId === plan.id)
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
              <span className="text-white/70">Points You&apos;ll Earn</span>
              <span className="text-2xl font-bold text-[#8dc63f]">+{calculateTotalPoints()} pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || products.length === 0 || !formData.customerAddress.trim()}
          className="px-8 py-3 bg-[#8dc63f] text-white rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Submitting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Submit Sale
            </>
          )}
        </button>
      </div>
    </form>
  );
}
