'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Bell, Bug, ChevronDown, ChevronsUpDown, LogOut, Menu, MessageCircleQuestion, Plus, Settings, Shield } from 'lucide-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { CommandPalette, portalNavGroups } from '@/components/portal/CommandPalette';
import { NavGroupsList, NavSheet } from '@/components/portal/NavSheet';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { REP_TABS } from '@/components/portal/rep/repNav';
import { repSheetClasses } from '@/components/portal/rep/RepTopBar';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { AdminNotice, AdminPageHead, AdminTabs, StatusDot } from '@/components/portal/admin-d/AdminUi';
import { Choices, Field, FormHeader, FormSection, YesNo } from '@/components/portal/rep/RepForm';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import fr from '@/components/portal/admin-d/admin-frame.module.css';

// Dev-only harness for the taste pass Package F (the shared shell layer). No
// auth, no network. ?view=shell|admin|form, ?panel=menu|more|account|notes|admin|palette.

const ALL = () => true;
const ADMIN_ITEMS = portalNavGroups.flatMap((g) => g.items.filter((i) => i.href.startsWith('/portal/admin/')));
const NOTES = [
  { id: '1', title: 'Sale installed', message: 'Dana Alvarez, T-Fiber 1 Gig is installed. Est. payout window Sep 28 to Oct 3.', time: '2h ago', read: false },
  { id: '2', title: 'New announcement', message: 'Friday team call is at 10 AM this week.', time: '1d ago', read: true },
  { id: '3', title: 'Install date needed', message: 'Ada Okafor still needs an install date.', time: '2d ago', read: true },
];

function TopBar({ panel, onPanel }: { panel: string | null; onPanel: (next: string | null) => void }) {
  const desk = REP_TABS.filter((t) => !t.log);
  return (
    <header className={s.topbar}>
      <div className={s.topbarInner}>
        <a href="#" className={s.brand} aria-label="3C World Group home">
          <Image src="/logo.webp" alt="" width={550} height={516} sizes="34px" className={s.brandMark} priority />
          <span className={s.brandWord}>3C World Group</span>
        </a>
        <ul className={s.deskNav}>
          {desk.map((tab, i) => (
            <li key={tab.href}>
              <a href="#" className={s.navLink} aria-current={i === 0 ? 'page' : undefined}>
                {tab.label}
              </a>
            </li>
          ))}
          <li>
            <button type="button" className={s.navLink} aria-expanded={panel === 'more'} onClick={() => onPanel('more')}>
              More
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </li>
        </ul>
        <a href="#" className={s.iconBtn} aria-label="Ask 3C">
          <MessageCircleQuestion size={22} strokeWidth={1.75} aria-hidden="true" />
        </a>
        <button type="button" className={s.iconBtn} aria-expanded={panel === 'notes'} aria-label="Notifications" onClick={() => onPanel('notes')}>
          <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
          <i className={s.pushDot} aria-hidden="true" />
          <span className={s.badge}>1</span>
        </button>
        <button type="button" className={`${s.iconBtn} ${s.phoneOnly}`} aria-expanded={panel === 'menu'} aria-label="Menu" onClick={() => onPanel('menu')}>
          <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
          <i className={s.dot} aria-hidden="true" />
        </button>
        <button type="button" className={s.avatarBtn} aria-expanded={panel === 'account'} onClick={() => onPanel('account')}>
          <span className={s.playerName}>Jordan Reyes</span>
          <span className={s.avatar} aria-hidden="true">JR</span>
        </button>
        <a href="#" className={`${s.btnPrimary} ${s.navCta}`}>
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          Log sale
        </a>
      </div>
    </header>
  );
}

function Panels({ panel, onPanel }: { panel: string | null; onPanel: (next: string | null) => void }) {
  const close = () => onPanel(null);
  if (panel === 'menu') {
    return (
      <BodyLayer>
        <NavSheet id="pf-nav" titleId="pf-nav-title" groups={portalNavGroups} pathname="/portal/admin/users" canAccess={ALL} counts={{ '/portal/admin/users': 3 }} onClose={close} onSignOut={close} classes={repSheetClasses} />
      </BodyLayer>
    );
  }
  if (panel === 'more') {
    return (
      <BodyLayer>
        <button type="button" className={s.dropClear} aria-label="Close menu" tabIndex={-1} onClick={close} />
        <div className={`${s.drop} ${s.moreDrop}`} style={{ left: 420, right: 'auto' }} role="dialog" aria-label="More pages">
          <NavGroupsList groups={portalNavGroups} pathname="/portal/calls" canAccess={ALL} counts={{ '/portal/admin/users': 3 }} onLinkClick={close} classes={{ ...repSheetClasses, nav: s.moreNav }} />
        </div>
      </BodyLayer>
    );
  }
  if (panel === 'account') {
    return (
      <BodyLayer>
        <button type="button" className={s.dropClear} aria-label="Close account menu" tabIndex={-1} onClick={close} />
        <div className={s.drop} role="dialog" aria-label="Account">
          <p className={s.whoami}>
            Jordan Reyes
            <span>jordan@example.com</span>
          </p>
          <div className={s.navGroup}>
            <a href="#" className={s.navItem}><Settings aria-hidden="true" />Settings</a>
            <a href="#" className={s.navItem}><Bug aria-hidden="true" />Report a bug</a>
            <button type="button" className={s.navItem}><LogOut aria-hidden="true" />Sign out</button>
          </div>
        </div>
      </BodyLayer>
    );
  }
  if (panel === 'notes') {
    return (
      <BodyLayer>
        <button type="button" className={s.dropClear} aria-label="Close notifications" tabIndex={-1} onClick={close} />
        <div className={s.drop} role="dialog" aria-labelledby="pf-notes">
          <div className={s.noteHead}>
            <h2 id="pf-notes" className={s.sheetTitle}>Notifications</h2>
            <button type="button" className={s.textBtn}>Mark all read</button>
          </div>
          <a href="#" className={s.notePush}>
            <Bell size={18} aria-hidden="true" />
            <span>Alerts are off on this device.<b>Turn on</b></span>
          </a>
          {NOTES.map((n) => (
            <button key={n.id} type="button" className={`${s.note} ${n.read ? '' : s.noteUnread}`}>
              <span className={s.noteTitle}>{n.title}</span>
              <span className={s.noteTime}>{n.time}</span>
              <span className={s.noteMsg}>{n.message}</span>
            </button>
          ))}
          <div className={s.noteFoot}>
            <button type="button" className={s.textBtn}>Clear all</button>
          </div>
        </div>
      </BodyLayer>
    );
  }
  if (panel === 'admin') {
    return (
      <AdminSheet title="Admin pages" onClose={close}>
        <nav className={`${fr.sheetList} ${s.navGroup}`} aria-label="Admin pages">
          {ADMIN_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <a key={item.href} href="#" className={s.navItem} aria-current={i === 0 ? 'page' : undefined}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {i === 1 ? <b className={s.navCount}>2</b> : null}
              </a>
            );
          })}
        </nav>
      </AdminSheet>
    );
  }
  if (panel === 'palette') {
    return (
      <AuthProvider>
        <CommandPalette open onOpenChange={close} />
      </AuthProvider>
    );
  }
  return null;
}

function ShellBody() {
  const [tab, setTab] = useState('week');
  const [chip, setChip] = useState('all');
  return (
    <div className={p.page}>
      <header className={p.head}>
        <h1 className={p.title}>Calls</h1>
        <p className={p.lede}>Team calls this week and the recordings of the last ones.</p>
      </header>
      <div className={p.tabs} role="tablist" aria-label="Range">
        {['week', 'month', 'all'].map((v) => (
          <button key={v} type="button" role="tab" className={p.tab} aria-selected={tab === v} onClick={() => setTab(v)}>
            {v === 'week' ? 'This week' : v === 'month' ? 'This month' : 'All'}
          </button>
        ))}
      </div>
      <div className={p.chipRow}>
        {['all', 'team', 'training', 'recorded'].map((v) => (
          <button key={v} type="button" className={p.chip} aria-pressed={chip === v} onClick={() => setChip(v)}>
            {v[0].toUpperCase() + v.slice(1)} <b>{v.length}</b>
          </button>
        ))}
      </div>
      <h2 className={s.kicker}>Kicker (now neutral text)</h2>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2 className={s.kicker}>Upcoming</h2>
          <a href="#" className={p.headLink}>See all</a>
        </div>
        <ul className={p.rows}>
          {['Team huddle', 'Fiber training', 'Weekly wins'].map((t, i) => (
            <li key={t}>
              <a href="#" className={p.row}>
                <span className={`${p.tile} ${i === 0 ? p.tileLime : ''}`}><Bell size={18} /></span>
                <span className={p.rowText}>
                  <span className={p.rowTitle}>{t}</span>
                  <span className={p.rowSub}>Thursday 10:30 AM · Video call</span>
                </span>
                <span className={`${p.tag} ${p.tagLime}`}>Live</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <div className={`${p.notice} ${p.noticeAmber}`}><Shield size={18} /><span><strong>Heads up.</strong> Recordings stay up for 30 days.</span></div>
      <div className={s.failed}>Couldn&apos;t load calls.<button type="button" className={s.retry}>Retry</button></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={s.btnPrimary}>Join call</button>
        <button type="button" className={s.btnSecondary}>Add to calendar</button>
      </div>
      <span className={s.skel} style={{ height: 48 }} />
    </div>
  );
}

function AdminBody({ onPanel }: { onPanel: (next: string | null) => void }) {
  const [tab, setTab] = useState('open');
  const [seg, setSeg] = useState('all');
  const [chip, setChip] = useState('new');
  return (
    <div className={fr.frame}>
      <nav className={fr.rail} aria-label="Admin pages">
        <ul className={fr.railGroup}>
          {ADMIN_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <a href="#" className={fr.railLink} aria-current={i === 0 ? 'page' : undefined}>
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {i === 1 ? <b className={fr.railCount}>2</b> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={fr.content}>
        <button type="button" className={fr.switcher} aria-expanded={false} onClick={() => onPanel('admin')}>
          <Shield className={fr.switcherIcon} aria-hidden="true" />
          <span className={fr.switcherText}>
            <span className={fr.switcherKicker}>Admin</span>
            <span className={fr.switcherLabel}>People</span>
          </span>
          <b className={fr.switcherCount}>3</b>
          <ChevronsUpDown size={18} className={fr.switcherChevron} aria-hidden="true" />
        </button>
        <div className={u.page} style={{ gap: 16 }}>
          <AdminPageHead title="People" meta={<><b>48</b> active</>} sub="Everyone with a portal account. Open a person to change their role." />
          <AdminTabs label="People" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Signups', count: 3 }, { value: 'active', label: 'Active', count: 48 }, { value: 'off', label: 'Deactivated', count: 0 }]} />
          <div className={u.segmented} role="group" aria-label="Status">
            {['all', 'reps', 'managers'].map((v) => (
              <button key={v} type="button" aria-pressed={seg === v} onClick={() => setSeg(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <div className={u.btnRow}>
            {['new', 'waiting', 'done'].map((v) => (
              <button key={v} type="button" className={u.chip} aria-pressed={chip === v} onClick={() => setChip(v)}>
                {v[0].toUpperCase() + v.slice(1)} <span className={u.chipCount}>4</span>
              </button>
            ))}
          </div>
          <AdminNotice tone="warn">Three signups are waiting on a team code check.</AdminNotice>
          <AdminNotice tone="ok">Role saved.</AdminNotice>
          <section className={s.panel}>
            <div className={`${s.panelHead} ${u.band}`}><h2 className={s.kicker}>Signups</h2></div>
            <div className={u.tHead} style={{ ['--cols' as string]: '2fr 1fr 1fr' }}>
              <span>Name</span><span>Role</span><span>Status</span>
            </div>
            <ul className={u.rows}>
              {['Ada Okafor', 'Lee Whitfield', 'Kim Park'].map((n, i) => (
                <li key={n}>
                  <a href="#" className={`${u.row} ${i === 0 ? u.rowHot : ''}`} style={{ ['--cols' as string]: '2fr 1fr 1fr' }}>
                    <span className={u.cellMain}>{n}<span className={u.cellSub}>{n.split(' ')[0].toLowerCase()}@example.com</span></span>
                    <span className={u.cell} data-label="Role">Sales rep <span className={u.tag}>IBO</span></span>
                    <span className={u.cell} data-label="Status"><StatusDot tone={i === 0 ? 'amber' : 'lime'}>{i === 0 ? 'Waiting' : 'Active'}</StatusDot></span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <dl className={u.facts}>
            <div><dt>Sales this month</dt><dd>12</dd></div>
            <div><dt>Joined</dt><dd>Aug 4, 2026</dd></div>
          </dl>
          <div className={u.btnRow}>
            <button type="button" className={`${s.btnSecondary} ${u.sm}`}>Export</button>
            <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.danger}`}>Deactivate</button>
            <span className={`${u.tag} ${u.tagLime}`}>Admin only</span>
            <span className={`${u.tag} ${u.tagRed}`}>Sensitive</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormBody() {
  const [kind, setKind] = useState('');
  const [rate, setRate] = useState('4');
  const [yes, setYes] = useState<boolean | null>(true);
  const [reason, setReason] = useState('Missing commission on an installed sale');
  return (
    <div className={f.page}>
      <div className={f.frame}>
        <FormHeader title="Payroll dispute" lede="Tell us what looks wrong on your pay. Payroll replies within two business days." />
        <form className={f.form} onSubmit={(e) => e.preventDefault()} noValidate>
          <FormSection title="The sale">
            <Field id="pf-name" label="Customer name" required>
              <input id="pf-name" className={f.input} defaultValue="Dana Alvarez" />
            </Field>
            <Field id="pf-date" label="Install date" hint="From the install confirmation.">
              <input id="pf-date" className={f.input} placeholder="Sep 19" />
            </Field>
            <Choices name="pf-kind" label="Carrier" value={kind} options={['T-Fiber', 'AT&T', 'Frontier', 'Xfinity']} onChange={setKind} required error={kind ? undefined : 'Pick the carrier.'} />
            <Choices name="pf-rate" label="How urgent is it?" value={rate} options={['1', '2', '3', '4', '5']} onChange={setRate} columns={5} />
          </FormSection>
          <FormSection title="What happened">
            <YesNo name="pf-yes" label="Has the customer been billed?" value={yes} onChange={setYes} />
            <Choices name="pf-reason" label="Reason" value={reason} options={['Missing commission on an installed sale', 'Commission amount looks lower than expected', 'Chargeback I do not recognise']} onChange={setReason} />
            <Field id="pf-notes" label="Anything else" wide>
              <textarea id="pf-notes" className={`${f.input} ${f.textarea}`} placeholder="Order number, dates, what you expected" />
            </Field>
          </FormSection>
          <div className={f.alert} role="alert"><Shield size={18} /><p><strong>Couldn&apos;t send.</strong> Check your connection and try again.</p></div>
          <div className={f.submitInline} data-keyboard="open">
            <button type="submit" className={`${s.btnPrimary} ${f.submit}`}>Send dispute</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Harness() {
  const q = useSearchParams();
  const view = q.get('view') ?? 'shell';
  const [panel, setPanel] = useState<string | null>(q.get('panel'));
  const toggle = (next: string | null) => setPanel((cur) => (cur === next ? null : next));
  return (
    <div className={s.root} data-shell="rep">
      <TopBar panel={panel} onPanel={toggle} />
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          {view === 'admin' ? <AdminBody onPanel={toggle} /> : view === 'form' ? <FormBody /> : <ShellBody />}
        </div>
      </main>
      <BodyLayer>
        <nav className={s.tabbar} aria-label="Primary">
          <ul className={s.tabs}>
            {REP_TABS.map((tab, i) => {
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <a href="#" className={s.tab} aria-current={i === 0 ? 'page' : undefined}>
                    {tab.log ? <span className={s.tabLog}><Icon size={20} /></span> : <span className={s.tabIcon}><Icon size={22} /></span>}
                    {tab.short}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </BodyLayer>
      <Panels panel={panel} onPanel={toggle} />
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
