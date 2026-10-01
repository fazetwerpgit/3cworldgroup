'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { FIBER_COMPANIES, getPlansByCompany, type FiberPlan, type SaleProduct } from '@/types';
import { selectedInternetProduct } from '@/lib/sales/planSelection';
import { formatPrice, num } from './saleFormat';
import x from './rep-sale.module.css';

// Internet plans are a CHOICE, extras are a LIST. One internet plan can be sold
// at an address (see src/lib/sales/planSelection.ts), so those rows behave like
// radio buttons: picking another one swaps. The extras stack, so they keep the
// add affordance.
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
    <button
      type="button"
      className={x.planPick}
      // A chosen internet plan stays put; an extra already on the sale is
      // removed from the list below.
      disabled={selected}
      role={asChoice ? 'radio' : undefined}
      aria-checked={asChoice ? selected : undefined}
      aria-label={label}
      onClick={() => onAdd(plan)}
    >
      <span className={x.planPickName}>
        {plan.name}
        <span className={x.planPickSpeed}>{plan.speed}</span>
      </span>
      <span className={x.planPickPrice}>
        {formatPrice(plan.price)}/mo
        <span className={x.planPickPts}>+{num(plan.points)} pts</span>
      </span>
      {selected ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
    </button>
  );
}

/** Provider chips, then that provider's plans. D version of the old PlanPicker. */
export function RepPlanPicker({
  products,
  onAdd,
}: {
  products: SaleProduct[];
  onAdd: (plan: FiberPlan) => void;
}) {
  const [selectedCompany, setSelectedCompany] = useState('');

  const plans = selectedCompany ? getPlansByCompany(selectedCompany) : [];
  const hasExtras = plans.some((p) => p.category === 'extra');
  const internetPlans = hasExtras ? plans.filter((p) => p.category !== 'extra') : plans;
  const extraPlans = hasExtras ? plans.filter((p) => p.category === 'extra') : [];
  const chosenInternetId = selectedInternetProduct(products)?.productId ?? null;

  return (
    <div className={x.picker}>
      <p className={x.pickerLabel} id="plan-provider-label">
        Provider
      </p>
      <div className={x.providers} role="group" aria-labelledby="plan-provider-label">
        {FIBER_COMPANIES.map((company) => (
          <button
            key={company.value}
            type="button"
            className={x.provider}
            aria-pressed={selectedCompany === company.value}
            onClick={() => setSelectedCompany(company.value)}
          >
            {company.label}
          </button>
        ))}
      </div>

      {selectedCompany ? (
        <>
          <p className={x.hint}>One plan per address. Picking another swaps it.</p>
          {hasExtras ? <p className={x.pickerGroup}>Internet</p> : null}
          <div className={x.planList} role="radiogroup" aria-label="Internet plan">
            {internetPlans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} selected={plan.id === chosenInternetId} asChoice onAdd={onAdd} />
            ))}
          </div>
          {hasExtras ? (
            <>
              <p className={x.pickerGroup}>Extras</p>
              <div className={x.planList}>
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
          ) : null}
        </>
      ) : (
        <p className={x.pickerEmpty}>Pick a provider to see its plans</p>
      )}
    </div>
  );
}
