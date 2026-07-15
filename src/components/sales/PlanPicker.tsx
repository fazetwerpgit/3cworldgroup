'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { FiberPlan, SaleProduct, FIBER_COMPANIES, getPlansByCompany } from '@/types';

interface PlanPickerProps {
  products: SaleProduct[];
  onAdd: (plan: FiberPlan) => void;
}

function PlanRow({ plan, added, onAdd }: { plan: FiberPlan; added: boolean; onAdd: (plan: FiberPlan) => void }) {
  return (
    <div className={`sales-line-plan-row ${added ? 'added' : ''}`}>
      <div className="sales-line-plan-row-name">
        {plan.name} <span className="sales-line-plan-row-speed">{plan.speed}</span>
      </div>
      <div className="sales-line-plan-row-price">${plan.price.toFixed(2)}/mo</div>
      <div className="sales-line-plan-row-pts">+{plan.points} pts</div>
      <button
        type="button"
        className="sales-line-plan-row-add"
        disabled={added}
        aria-label={added ? 'Already added' : 'Add plan'}
        onClick={() => onAdd(plan)}
      >
        {added ? <Check className="sales-line-icon" aria-hidden="true" /> : <Plus className="sales-line-icon" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function PlanPicker({ products, onAdd }: PlanPickerProps) {
  const [selectedCompany, setSelectedCompany] = useState<string>('');

  const plans = selectedCompany ? getPlansByCompany(selectedCompany) : [];
  const hasExtras = plans.some((p) => p.category === 'extra');
  const internetPlans = hasExtras ? plans.filter((p) => p.category !== 'extra') : plans;
  const extraPlans = hasExtras ? plans.filter((p) => p.category === 'extra') : [];

  return (
    <div>
      <label className="sales-line-field-label">Choose provider</label>
      <div className="sales-line-chip-row">
        {FIBER_COMPANIES.map((company) => (
          <button
            key={company.value}
            type="button"
            className={`sales-line-chip ${selectedCompany === company.value ? 'selected' : ''}`}
            onClick={() => setSelectedCompany(company.value)}
          >
            {company.label}
          </button>
        ))}
      </div>

      {selectedCompany ? (
        <div className="sales-line-plan-picker">
          <label className="sales-line-field-label" style={{ marginTop: 14 }}>Choose plan</label>
          {hasExtras ? (
            <>
              <p className="sales-line-subgroup-label">Internet</p>
              <div className="sales-line-row-list">
                {internetPlans.map((plan) => (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    added={products.some((p) => p.productId === plan.id)}
                    onAdd={onAdd}
                  />
                ))}
              </div>
              <p className="sales-line-subgroup-label">Extras</p>
              <div className="sales-line-row-list">
                {extraPlans.map((plan) => (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    added={products.some((p) => p.productId === plan.id)}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="sales-line-row-list">
              {plans.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  added={products.some((p) => p.productId === plan.id)}
                  onAdd={onAdd}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="sales-line-plan-picker-empty">Select a provider above to see its plans</div>
      )}
    </div>
  );
}
