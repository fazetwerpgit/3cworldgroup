'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/hooks/useSales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  SaleType,
  SaleProduct,
  SALE_TYPES,
  FIBER_COMPANIES,
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
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [formError, setFormError] = useState('');

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {(formError || error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError || error}
        </div>
      )}

      <Card className="rounded-lg border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <CardTitle className="text-[#0A1F44] dark:text-foreground">Customer Address</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
        <div>
          <Label className="mb-1">
            Installation Address *
          </Label>
          <Input
            type="text"
            name="customerAddress"
            value={formData.customerAddress}
            onChange={handleChange}
            required
            className="h-11"
            placeholder="123 Main St, City, State 12345"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">Enter the full address where service will be installed</p>
        </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <CardTitle className="text-[#0A1F44] dark:text-foreground">Customer Information <span className="text-sm font-normal text-slate-400">(Optional)</span></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="mb-1">
              Customer Name
            </Label>
            <Input
              type="text"
              name="customerName"
              value={formData.customerName}
              onChange={handleChange}
              placeholder="John Smith"
            />
          </div>
          <div>
            <Label className="mb-1">
              Phone Number
            </Label>
            <Input
              type="tel"
              name="customerPhone"
              value={formData.customerPhone}
              onChange={handleChange}
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <Label className="mb-1">
              Email
            </Label>
            <Input
              type="email"
              name="customerEmail"
              value={formData.customerEmail}
              onChange={handleChange}
              placeholder="customer@email.com"
            />
          </div>
        </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <CardTitle className="text-[#0A1F44] dark:text-foreground">Select Plan</CardTitle>
        </CardHeader>
        <CardContent className="p-5">

        <div className="mb-6">
          <Label className="mb-3">Choose Provider</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FIBER_COMPANIES.map((company) => (
              <button
                key={company.value}
                type="button"
                onClick={() => handleCompanyChange(company.value)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  selectedCompany === company.value
                    ? 'border-[#8dc63f] bg-[#8dc63f]/5 shadow-[inset_0_0_0_1px_#8dc63f]'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:hover:border-white/25 dark:hover:bg-muted'
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availablePlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => addPlan(plan.id)}
                  disabled={products.some(p => p.productId === plan.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    products.some(p => p.productId === plan.id)
                      ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed dark:border-border dark:bg-muted'
                      : 'border-gray-200 hover:border-[#8dc63f] hover:bg-[#8dc63f]/5 dark:border-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-slate-950 dark:text-foreground block">{plan.name}</span>
                      <span className="text-sm text-slate-500 dark:text-muted-foreground">{plan.speed}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#0A1F44] dark:text-foreground">${plan.price.toFixed(2)}</span>
                      <span className="text-xs text-gray-500 dark:text-muted-foreground block">/month</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Badge variant="outline" className="border-[#8dc63f]/20 bg-[#8dc63f]/10 text-[#5a8f1f]">
                      +{plan.points} pts
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {products.length > 0 && (
          <div>
            <Label className="mb-3">Selected Plans</Label>
            <div className="space-y-2">
              {products.map((product, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-muted">
                  <div>
                    <span className="font-medium text-slate-950 dark:text-foreground">{product.productName}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-500 dark:text-muted-foreground">${product.unitPrice.toFixed(2)}/mo</span>
                      <Badge variant="outline" className="border-[#8dc63f]/20 bg-[#8dc63f]/10 text-[#5a8f1f]">
                        +{product.points} pts
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeProduct(index)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-800"
                  >
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

      <Card className="rounded-lg border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <CardTitle className="text-[#0A1F44] dark:text-foreground">Sale Details</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1">Sale Type</Label>
            <NativeSelect
              name="saleType"
              value={formData.saleType}
              onChange={handleChange}
              className="w-full"
            >
              {SALE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label className="mb-1">Notes</Label>
            <Input
              type="text"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional context for review"
            />
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
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || products.length === 0 || !formData.customerAddress.trim()}
          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Submitting...
            </>
          ) : (
            <>
              <Check className="size-4" />
              Submit Sale
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
