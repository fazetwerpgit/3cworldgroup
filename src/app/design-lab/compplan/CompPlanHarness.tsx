'use client';

import { Edit3, ExternalLink } from 'lucide-react';
import { ProgressCard, RESOURCE_QUICK_LINKS, ShortsEmpty } from '@/components/portal/rep/RepLearn';
import { COMP_PLAN_ROLES, CompPlanRole, FIBER_COMPANIES, FIBER_PLANS, FieldRole, IBO_FIELD_ROLES, RoleDisplayNames } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import l from '@/components/portal/rep/rep-learn.module.css';
import c from '@/components/resources/comp-plan.module.css';

// CompPlanMatrix and RepPayStructure call useAuth(), whose context is not
// exported, so their markup is mirrored here (same DOM + CSS modules) with
// mock rates. Everything else is the real component.
const ROLE_SHORT: Partial<Record<CompPlanRole, string>> = {
  ae_tier_1: 'AE T1', ae_tier_2: 'AE T2', gm_in_training: 'GM Trn', general_manager: 'GM',
  office_manager: 'Office', regional_manager: 'Regional', director: 'Director', internal_rep: 'Internal',
  operations: 'Ops',
};
const SHOWN_ROLES = COMP_PLAN_ROLES.filter((role) => !IBO_FIELD_ROLES.includes(role as FieldRole));

const rate = (i: number, j: number) => [146.25, 243.75, 88.5, 1250, 62][(i + j) % 5];
const money = (v: number) => (v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`);

function Matrix({ edit }: { edit: boolean }) {
  return (
    <section aria-labelledby="comp-plan-title" data-probe="matrix">
      <div className={c.head}>
        <h2 id="comp-plan-title" className={c.title}>Comp plan</h2>
        {!edit && (
          <button className={p.headLink} type="button" data-probe="edit-plan">
            <Edit3 size={14} aria-hidden="true" /> Edit plan
          </button>
        )}
      </div>
      <div className={c.scroll} data-probe="scroll">
        <table className={c.table}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              {SHOWN_ROLES.map((role) => (
                <th key={role} scope="col" title={RoleDisplayNames[role]} data-col={ROLE_SHORT[role]}>
                  {ROLE_SHORT[role]}
                </th>
              ))}
              <th scope="col" className={c.margin} data-col="3C Receives">3C Receives</th>
            </tr>
          </thead>
          {FIBER_COMPANIES.map((company) => (
            <tbody key={company.value}>
              <tr className={c.group}>
                <th scope="colgroup" colSpan={SHOWN_ROLES.length + 2}>{company.label}</th>
              </tr>
              {FIBER_PLANS.filter((plan) => plan.company === company.value).map((plan, j) => (
                <tr key={plan.id}>
                  <th scope="row">{plan.name}</th>
                  {SHOWN_ROLES.map((role, i) => (
                    <td key={role}>
                      {edit ? (
                        <input className={`${p.input} ${c.rateInput}`} type="number" inputMode="decimal" defaultValue={rate(i, j)} />
                      ) : (
                        money(rate(i, j))
                      )}
                    </td>
                  ))}
                  <td className={c.margin}>
                    {edit ? <input className={`${p.input} ${c.rateInput}`} type="number" inputMode="decimal" defaultValue={243.75} /> : '$140'}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {edit && (
        <div className={c.actions}>
          <button className={s.btnSecondary} type="button" data-probe="cancel">Cancel</button>
          <button className={s.btnPrimary} type="button" data-probe="save">Save plan</button>
        </div>
      )}
      <p className={c.updated}>Plan 7.1 · Updated Sep 22, 2026 by Jacob Myers</p>
    </section>
  );
}

function PayStructure({ children }: { children?: React.ReactNode }) {
  return (
    <section className={s.panel} aria-labelledby="pay-structure-title">
      <div className={s.panelHead}>
        <h2 id="pay-structure-title" className={s.kicker}>Pay structure</h2>
        <button className={p.headLink} type="button"><Edit3 size={14} aria-hidden="true" /> Edit rates</button>
      </div>
      <div>
        {['entry_rep', 'senior_rep', 'team_lead', 'manager'].map((role, i) => (
          <div className={l.tier} key={role}>
            <span>{RoleDisplayNames[role as keyof typeof RoleDisplayNames] ?? role}</span>
            <span className={l.tierRate}>{10 + i * 2}%{i > 1 ? ' + 2%' : ''}</span>
          </div>
        ))}
      </div>
      <p className={l.updated}>Last updated Sep 22, 2026 by Jacob Myers</p>
      {children}
    </section>
  );
}

export function CompPlanHarness({ edit, inPanel }: { edit: boolean; inPanel: boolean }) {
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <div className={p.page}>
            <header className={p.head}>
              <h1 className={p.title}>Resources</h1>
            </header>
            <div className={`${l.layout} ${l.hub}`}>
              <div className={l.col}>
                <ProgressCard completed={7} total={12} requiredLeft={2} link={{ href: '#', label: 'Open University' }} />
                <section className={s.panel} aria-labelledby="tools-title">
                  <div className={s.panelHead}>
                    <h2 id="tools-title" className={s.kicker}>Field tools</h2>
                  </div>
                  <ul className={p.rows}>
                    {RESOURCE_QUICK_LINKS.map((link) => {
                      const Icon = link.icon;
                      return (
                        <li key={link.title}>
                          <a className={p.row} href="#">
                            <span className={p.tile}><Icon size={20} aria-hidden="true" /></span>
                            <span className={p.rowText}>
                              <span className={p.rowTitle}>{link.title}</span>
                              <span className={p.rowSub}>{link.description}</span>
                            </span>
                            <ExternalLink size={18} className={l.toolIcon} aria-hidden="true" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
              <div className={l.col}>
                <PayStructure>
                  {inPanel && (
                    <div className={l.matrix} style={{ borderTop: '1px solid var(--c-line)' }}>
                      <Matrix edit={edit} />
                    </div>
                  )}
                </PayStructure>
                <section className={s.panel} aria-labelledby="shorts-title">
                  <div className={s.panelHead}>
                    <h2 id="shorts-title" className={s.kicker}>Short videos</h2>
                  </div>
                  <ShortsEmpty />
                </section>
              </div>
            </div>
            {!inPanel && (
              <div className={`${s.panel} ${l.matrix}`}>
                <Matrix edit={edit} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
