'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { FiberPlan, SaleProduct, FIBER_COMPANIES, getPlansByCompany } from '@/types';
import { selectedInternetProduct } from '@/lib/sales/planSelection';

interface PlanPickerProps {
  products: SaleProduct[];
  onAdd: (plan: FiberPlan) => void;
}

// Internet plans are a CHOICE, extras are a LIST. One internet plan can be sold
// at an address (see src/lib/sales/planSelection.ts), so those rows behave like
// radio buttons: picking another one swaps. The extras stack, so they keep the
// add affordance. The two groups look the same on purpose — only the icon and
// the announced role differ — because a rep is scanning prices, not controls.
function PlanRow({
  plan,
  selected,
  asChoice,
  onAdd,
}: {
  plan: FiberPlan;
  selected: boolean;
  asChoice: boolean;
  onAdd: (plan: FiberPlan) => void;
}) {
  const label = asChoice
    ? selected ? `${plan.name} selected` : `Choose ${plan.name}`
    : selected ? 'Already added' : `Add ${plan.name}`;

  return (
    <div className={`sales-line-plan-row ${selected ? 'added' : ''}`}>
      <div className="sales-line-plan-row-name">
        {plan.name} <span className="sales-line-plan-row-speed">{plan.speed}</span>
      </div>
      <div className="sales-line-plan-row-price">${plan.price.toFixed(2)}/mo</div>
      <div className="sales-line-plan-row-pts">+{plan.points} pts</div>
      <button
        type="button"
        className="sales-line-plan-row-add"
        // A chosen internet plan stays clickable-looking but does nothing; an
        // extra that is already on the sale is removed from the list below.
        disabled={selected}
        role={asChoice ? 'radio' : undefined}
        aria-checked={asChoice ? selected : undefined}
        aria-label={label}
        onClick={() => onAdd(plan)}
      >
        {selected ? <Check className="sales-line-icon" aria-hidden="true" /> : <Plus className="sales-line-icon" aria-hidden="true" />}
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
  const chosenInternetId = selectedInternetProduct(products)?.productId ?? null;

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
          <p className="sales-line-subgroup-hint">One plan per address — picking another swaps it.</p>
          {hasExtras ? (
            <>
              <p className="sales-line-subgroup-label">Internet</p>
              <div className="sales-line-row-list" role="radiogroup" aria-label="Internet plan">
                {internetPlans.map((plan) => (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    selected={plan.id === chosenInternetId}
                    asChoice
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
                    selected={products.some((p) => p.productId === plan.id)}
                    asChoice={false}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="sales-line-row-list" role="radiogroup" aria-label="Internet plan">
              {plans.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === chosenInternetId}
                  asChoice
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
