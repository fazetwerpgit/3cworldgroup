'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronRight, FileText, Link2, Lock } from 'lucide-react';
import type { User } from '@/types';
import { AuthProvider } from '@/contexts/AuthContext';
import { AdminPageHead, StatusDot } from '@/components/portal/admin-d/AdminUi';
import { UserTable } from '@/components/admin/UserTable';
import { UserForm } from '@/components/admin/UserForm';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import p from '@/app/portal/admin/people/users.module.css';
import n from '@/app/portal/admin/people/notifications.module.css';
import d from '@/app/portal/admin/users/user-detail.module.css';
import f from '@/app/portal/admin/users/onboarding-file.module.css';
import o from '@/app/portal/admin/onboarding/admin-onboarding.module.css';
import pl from '@/app/portal/admin/onboarding/pipeline.module.css';
import r from '@/app/portal/admin/onboarding/recruiting.module.css';
import td from '@/app/portal/admin/onboarding/todo.module.css';
import uf from '@/components/admin/user-form.module.css';
import aq from '@/components/admin/action-queue.module.css';

// Dev-only harness for taste pass package P6 (Admin People and Hiring). No auth,
// sample data only, nothing is submitted. ?view=people|person|hiring.

const D = new Date('2026-09-01T12:00:00Z');
const mk = (uid: string, displayName: string, extra: Partial<User> = {}): User => ({
  uid,
  email: `${uid}@example.com`,
  displayName,
  isIBO: false,
  status: 'active',
  hireDate: D,
  createdAt: D,
  updatedAt: D,
  ...extra,
});
const USERS: User[] = [
  mk('dana', 'Dana Alvarez', { fieldRole: 'entry_rep', shirtSize: 'M' as User['shirtSize'] }),
  mk('ada', 'Ada Okafor', { fieldRole: 'l1_manager' }),
  mk('sam', 'Sam Lee', { role: 'admin' }),
  mk('kim', 'Kim Park', { status: 'pending' }),
  mk('lou', 'Lou Grant', { status: 'inactive', fieldRole: 'entry_rep' }),
];

function People() {
  const [chip, setChip] = useState('all');
  const [seg, setSeg] = useState('active');
  return (
    <div className={u.page}>
      <AdminPageHead title="People" sub="Everyone with a portal account. Tap someone for their details, checklist and pipeline stage." />
      <section className={`${s.panel} ${p.pending}`} aria-labelledby="h-pending">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="h-pending" className={u.sectionTitle}>Pending approval</h2>
          <span className={u.panelMeta}>2 waiting</span>
        </div>
        <ul className={u.rows}>
          {['Kim Park', 'Rae Diaz'].map((name, i) => (
            <li key={name} className={`${u.row} ${p.pendingRow}`}>
              <a href="#" className={`${u.person} ${p.personLink}`}>
                <span className={u.personText}>
                  <span className={u.personName}><span>{name}</span></span>
                  <span className={u.personSub}>{name.split(' ')[0].toLowerCase()}@example.com · requested 2h ago</span>
                </span>
              </a>
              <span className={p.pendingAction}>
                {i === 0 ? (
                  <button type="button" className={`${s.btnSecondary} ${u.sm}`}>Assign role</button>
                ) : (
                  <a href="#" className={p.acceptLink}>Open profile to accept<ChevronRight size={18} aria-hidden="true" /></a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={s.panel} aria-labelledby="h-all">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="h-all" className={u.sectionTitle}>All members</h2>
          <span className={u.panelMeta}>5</span>
        </div>
        <div className={p.filters}>
          <div className={u.chips}>
            {['all', 'reps', 'managers', 'admins'].map((c) => (
              <button key={c} type="button" className={u.chip} aria-pressed={chip === c} onClick={() => setChip(c)}>{c}</button>
            ))}
          </div>
          <div className={`${u.segmented} ${p.status}`} role="group" aria-label="Status">
            {['active', 'pending', 'inactive'].map((v) => (
              <button key={v} type="button" aria-pressed={seg === v} onClick={() => setSeg(v)}>
                {v}<span className={p.segCount}>2</span>
              </button>
            ))}
          </div>
        </div>
        <UserTable users={USERS} salesCounts={{ dana: 12, ada: 40 }} onPersonLink={() => {}} onViewAs={() => {}} onApprove={() => {}} />
      </section>
      <section className={s.panel} aria-labelledby="h-push">
        <div className={`${s.panelHead} ${u.band}`}>
          <h2 id="h-push" className={u.sectionTitle}>Active people</h2>
        </div>
        <ul className={u.rows}>
          <li className={u.row}>
            <span className={n.state}>
              <StatusDot tone="lime">Push on</StatusDot>
              <span className={n.checked}>Checked 2h ago</span>
            </span>
            <span className={n.require}><span className={n.requireLabel}>Require</span></span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Person() {
  const [mgr, setMgr] = useState('ada');
  return (
    <div className={u.page}>
      <AdminPageHead title="Dana Alvarez" sub="Entry rep · joined Sep 1" />
      <div className={d.layout}>
        <div className={d.main}>
          <section className={`${s.panel} ${f.section}`} aria-labelledby="h-file">
            <div className={`${s.panelHead} ${u.band} ${f.head}`}>
              <h2 id="h-file" className={u.sectionTitle}>Onboarding file</h2>
            </div>
            <div className={`${u.panelBody} ${f.body}`}>
              <div className={f.group}>
                <h3 className={f.subhead}>Documents</h3>
                <ul className={f.items}>
                  {['W-9', 'Direct deposit', 'Photo ID'].map((name) => (
                    <li key={name} className={f.item}>
                      <div className={f.itemTop}>
                        <span className={f.itemName}>{name}</span>
                        <StatusDot tone="lime">Approved</StatusDot>
                      </div>
                      <p className={f.itemMeta}>Uploaded Sep 2 · reviewed by Sam Lee</p>
                      <div className={f.actions}><button type="button" className={`${s.btnSecondary} ${u.sm}`}>Open</button></div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          <section className={s.panel} aria-labelledby="h-mgr">
            <div className={`${s.panelHead} ${u.band}`}><h2 id="h-mgr" className={u.sectionTitle}>Manager picker</h2></div>
            <div className={u.panelBody}>
              <ul className={uf.managerList}>
                {[['ada', 'Ada Okafor'], ['sam', 'Sam Lee'], ['lou', 'Lou Grant']].map(([id, name]) => (
                  <li key={id}>
                    <button type="button" className={uf.managerOption} aria-pressed={mgr === id} onClick={() => setMgr(id)}>
                      {name}
                      {mgr === id ? <Check size={18} className={uf.managerCheck} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <AuthProvider>
            <UserForm user={USERS[0]} />
          </AuthProvider>
        </div>
        <aside className={d.aside}>
          <section className={s.panel} aria-labelledby="h-sales">
            <div className={`${u.panelBody} ${d.salesBody}`}>
              <h2 id="h-sales" className={u.sectionTitle}>Approved sales</h2>
              <p className={u.hint}>Sales entered in the portal and approved for this person.</p>
              <strong className={`${u.statValue} ${u.statHot}`}>12</strong>
              <span className={u.statNote}>All time</span>
            </div>
          </section>
          <section className={`${s.panel} ${d.vault}`} aria-labelledby="h-vault">
            <div className={`${s.panelHead} ${u.band}`}><h2 id="h-vault" className={u.sectionTitle}>Sensitive information</h2></div>
            <div className={`${u.panelBody} ${d.vaultBody}`}>
              <dl className={`${u.facts} ${d.vaultFacts}`}>
                <div><dt>SSN</dt><dd className={u.num}>•••••1234</dd></div>
              </dl>
              <div className={d.revealConfirm}>
                <p>Revealing the full number is logged with your name.</p>
                <div className={d.revealRow}><button type="button" className={`${s.btnSecondary} ${u.sm} ${u.danger}`}>Reveal</button></div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Hiring() {
  const [pick, setPick] = useState('quit');
  return (
    <div className={u.page}>
      <AdminPageHead title="Hiring" sub="Invites, the pipeline and what is waiting on you." />
      <section className={s.panel} aria-labelledby="h-todo">
        <div className={`${s.panelHead} ${u.band}`}><h2 id="h-todo" className={u.sectionTitle}>To do</h2></div>
        <ul className={u.rows}>
          <li className={`${u.row} ${td.row}`}>
            <span className={td.text}><span className={td.name}>Dana Alvarez</span><span className={td.line}>2 documents are waiting on you.</span></span>
            <span className={td.rowAction}><button type="button" className={`${s.btnSecondary} ${u.sm}`}>Check</button></span>
          </li>
        </ul>
        <div className={u.panelBody}>
          <details className={td.fold} open>
            <summary>Portal alerts (1)</summary>
            <ul className={`${u.rows} ${aq.list}`}>
              <li className={`${u.row} ${aq.task}`}>
                <span className={aq.taskMsg}>Ada Okafor finished onboarding and is ready to activate.</span>
                <span className={`${u.btnRow} ${aq.taskActions}`}><button type="button" className={`${s.btnSecondary} ${u.sm}`}>Activate</button></span>
              </li>
            </ul>
          </details>
        </div>
      </section>
      <section className={s.panel} aria-labelledby="h-check">
        <div className={`${s.panelHead} ${u.band}`}><h2 id="h-check" className={u.sectionTitle}>Check sheet</h2></div>
        <div className={`${u.panelBody} ${td.sheetBody}`}>
          <ul className={o.items}>
            <li className={o.item}>
              <span className={o.itemText}><span className={o.itemName}>W-9</span><p className={o.itemDetail}>Uploaded Sep 2</p></span>
              <div className={o.reference}>
                <div className={o.files}>
                  <a href="#" className={o.file}><FileText size={16} /><span>w9-dana.pdf</span></a>
                  <button type="button" className={`${o.file} ${o.fileBtn}`}><FileText size={16} /><span>photo-id.jpg</span></button>
                </div>
                <p className={o.locked}><Lock size={16} />Admin only. Ask the owner to open it.</p>
                <p className={o.quote}>Reference: onboarding/dana/w9.pdf</p>
              </div>
            </li>
            <li className={o.item}><span className={o.itemText}><span className={o.itemName}>Direct deposit</span><p className={o.itemDetail}>Signed Sep 2</p></span><button type="button" className={o.pdfBtn}>Open PDF</button></li>
          </ul>
        </div>
      </section>
      <section className={s.panel} aria-labelledby="h-rec">
        <div className={`${s.panelHead} ${u.band}`}><h2 id="h-rec" className={u.sectionTitle}>Recruits</h2></div>
        <ul className={`${u.rows} ${r.list}`}>
          <li className={`${u.row} ${r.recruit}`}>
            <span className={u.person}><span className={u.personText}><span className={u.personName}>Rae Diaz</span><a href="#" className={`${u.personSub} ${r.contact}`}>rae@example.com</a></span></span>
            <span className={r.sentence}>Opened the invite yesterday, has not signed up.</span>
            <span className={`${u.btnRow} ${r.actions}`}>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`}>Copy link</button>
              <button type="button" className={`${s.btnSecondary} ${u.sm} ${r.activate}`}>Activate</button>
            </span>
          </li>
        </ul>
        <div className={r.rowLink}><span>Link copied.</span></div>
      </section>
      <button type="button" className={r.exportLink}>Export list</button>
      <section className={`${s.panel} ${r.formPanel}`} aria-labelledby="h-inv">
        <div className={`${s.panelHead} ${u.band}`}><h2 id="h-inv" className={u.sectionTitle}>Send an invite</h2></div>
        <div className={u.panelBody}>
          <div className={r.ready}>
            <p className={r.readyTitle}><Link2 size={18} />Invite ready</p>
            <p className={r.readyUrl}>https://www.3cworldgroup.com/portal/join?code=abc123</p>
          </div>
        </div>
      </section>
      <section className={s.panel} aria-labelledby="h-pipe">
        <div className={`${s.panelHead} ${u.band}`}><h2 id="h-pipe" className={u.sectionTitle}>Pipeline sheets</h2></div>
        <div className={`${u.panelBody} ${td.sheetBody}`}>
          <ul className={pl.channelList}>
            {['T-Fiber', 'Spectrum'].map((c) => (
              <li key={c} className={pl.channelRow}>
                <span className={pl.channelName}><strong>{c}</strong><span>Rep ID 4471</span></span>
                <span className={`${u.selectWrap} ${pl.channelSelect}`}><select className={u.input} defaultValue="a"><option value="a">Active</option></select></span>
              </li>
            ))}
          </ul>
          <fieldset className={pl.fieldset}>
            <div className={pl.choices}>
              {[['quit', 'Quit'], ['fired', 'Let go'], ['never', 'Never started']].map(([v, l]) => (
                <button key={v} type="button" className={pl.choice} aria-pressed={pick === v} onClick={() => setPick(v)}>{l}</button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}

function Harness() {
  const view = useSearchParams().get('view') ?? 'people';
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          {view === 'person' ? <Person /> : view === 'hiring' ? <Hiring /> : <People />}
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Harness />
    </Suspense>
  );
}
