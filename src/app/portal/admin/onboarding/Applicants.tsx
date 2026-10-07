'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RotateCw, Search, UserPlus } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/export/csv';
import {
  AdminEmpty,
  AdminFailed,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { hubTabHref, ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './recruiting.module.css';
import { ApplicationRecord, ApplicationStatus } from '@/types';
import { displayPhone, telHref } from '@/lib/phone';
import { interestLabels } from '@/lib/forms/applicationInterests';

// Everyone who applied on the website (/apply): the Recruits tab's first
// section, under the "Send an invite" button. Recruits loads the data and gates
// the tab; Refresh reloads all of it. Invite sets ?application=<id> on the same
// tab, which opens the invite form above filled from that applicant.

const APPLICATION_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'referredBy', label: 'Referred by' },
  { key: 'interestedIn', label: 'Interested in' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Submitted' },
];

type ApplicationView = 'new' | 'invited' | 'onboarded' | 'all';

const APPLICATION_VIEWS: { value: ApplicationView; label: string; status?: ApplicationStatus; meaning: string }[] = [
  { value: 'new', label: 'New', status: 'applied', meaning: 'Applied. No invite sent yet.' },
  { value: 'invited', label: 'Invited', status: 'invited', meaning: 'Invite sent. Follow it in the invites above.' },
  { value: 'onboarded', label: 'Onboarded', status: 'converted', meaning: 'Finished and on the team.' },
  { value: 'all', label: 'All', meaning: 'Every application, including Contacted and Not selected.' },
];

function inView(application: ApplicationRecord, view: ApplicationView): boolean {
  const status = APPLICATION_VIEWS.find((option) => option.value === view)?.status;
  return !status || application.status === status;
}

/** Case-insensitive match on name, city, email or phone. Digits also match the
 * phone ignoring its punctuation, so "5125550100" finds "(512) 555-0100". */
function matchesSearch(application: ApplicationRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [application.name, application.city, application.email, application.phone]
    .map((value) => (value ?? '').toLowerCase());
  if (haystack.some((value) => value.includes(needle))) return true;
  const digits = needle.replace(/\D/g, '');
  return digits.length >= 3 && (application.phone ?? '').replace(/\D/g, '').includes(digits);
}

const applicationStatusTone: Record<ApplicationStatus, Tone> = {
  applied: 'blue',
  contacted: 'amber',
  invited: 'blue',
  not_selected: 'muted',
  converted: 'lime',
};

const applicationStatusLabel: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  contacted: 'Contacted',
  invited: 'Invited',
  not_selected: 'Not selected',
  converted: 'Onboarded',
};

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Applicants({
  applications,
  loading,
  loadFailed,
  reload,
}: {
  applications: ApplicationRecord[];
  loading: boolean;
  loadFailed: boolean;
  reload: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<ApplicationView>('new');
  const [query, setQuery] = useState('');

  const counts = Object.fromEntries(
    APPLICATION_VIEWS.map((option) => [
      option.value,
      applications.filter((application) => inView(application, option.value)).length,
    ])
  ) as Record<ApplicationView, number>;
  const visible = applications.filter(
    (application) => inView(application, view) && matchesSearch(application, query)
  );

  return (
    <section className={s.panel} id="applications" aria-labelledby="applicants-heading">
      <div className={`${s.panelHead} ${u.band}`}>
        <h2 id="applicants-heading" className={s.kicker}>Website applications</h2>
        <span className={u.btnRow}>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
            onClick={reload}
            disabled={loading}
          >
            <RotateCw size={16} className={loading ? u.spin : undefined} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${u.quiet} ${r.export}`}
            disabled={visible.length === 0}
            onClick={() =>
              downloadCsv(
                'applications.csv',
                toCsv(
                  APPLICATION_COLUMNS,
                  visible.map((application) => ({ ...application, interestedIn: interestLabels(application.interests) }))
                )
              )
            }
          >
            <Download size={16} aria-hidden="true" />
            Export {visible.length} shown
          </button>
        </span>
      </div>
      <p className={`${u.hint} ${r.lede}`}>Everyone who applied on 3cworldgroup.com/apply.</p>
      <dl className={r.legend} aria-label="What the filters mean">
        {APPLICATION_VIEWS.map((option) => (
          <div key={option.value} className={r.legendItem}>
            <dt>{option.label}</dt>
            <dd>{option.meaning}</dd>
          </div>
        ))}
      </dl>
      {loading ? (
        <AdminSkeletonRows rows={4} label="Loading applications" />
      ) : loadFailed ? (
        <AdminFailed what="applications" onRetry={reload} />
      ) : applications.length === 0 ? (
        <AdminEmpty title="No website applications yet" />
      ) : (
        <>
          <div className={`${u.toolbar} ${r.filters}`}>
            <label className={`${u.search} ${r.searchBox}`}>
              <Search size={18} aria-hidden="true" />
              <input
                className={u.input}
                type="search"
                placeholder="Search name, city, email, phone"
                aria-label="Search applications"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className={`${u.segmented} ${r.status}`} role="group" aria-label="Filter applications">
              {APPLICATION_VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                  <span className={r.segCount}>{counts[option.value]}</span>
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <AdminEmpty title={query.trim() ? 'No applications match' : 'Nothing here'}>
              {query.trim() ? 'Try another name, city, email or phone.' : null}
            </AdminEmpty>
          ) : (
            <ul className={`${u.rows} ${r.appCols}`}>
              <li className={u.tHead} aria-hidden="true">
                <span>Applicant</span>
                <span>Contact</span>
                <span>Status</span>
                <span />
              </li>
              {visible.map((application) => (
                <li key={application.id} className={`${u.row} ${r.app}`}>
                  <span className={`${u.cellMain} ${u.person}`}>
                    <span className={u.personText}>
                      <span className={u.personName}>
                        <span>{application.name}</span>
                      </span>
                      <span className={u.personSub}>
                        {application.city ? `${application.city} · ` : ''}
                        <span className={u.num}>
                          {formatDate(application.createdAt ? application.createdAt.toString() : null)}
                        </span>
                      </span>
                      {application.referredBy ? (
                        <span className={u.personSub}>Referred by {application.referredBy}</span>
                      ) : null}
                      {application.interests?.length ? (
                        <span className={u.personSub}>Interested in {interestLabels(application.interests)}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className={`${u.cellEnd} ${r.appStatus}`}>
                    <StatusDot tone={applicationStatusTone[application.status] ?? 'blue'}>
                      {applicationStatusLabel[application.status] ?? application.status}
                    </StatusDot>
                  </span>
                  <span className={`${u.cell} ${r.phoneOnly}`} data-label="Phone">
                    <a className={`${u.num} ${r.contact}`} href={telHref(application.phone)}>
                      {displayPhone(application.phone)}
                    </a>
                  </span>
                  <span className={`${u.cell} ${r.phoneOnly}`} data-label="Email">
                    <a className={`${r.ellipsis} ${r.contact}`} href={`mailto:${application.email}`}>
                      {application.email}
                    </a>
                  </span>
                  <span className={`${u.cell} ${r.deskOnly}`}>
                    <span className={r.stackValue}>
                      <a className={`${u.num} ${r.contact}`} href={telHref(application.phone)}>
                        {displayPhone(application.phone)}
                      </a>
                      <a
                        className={`${u.cellSub} ${r.ellipsis} ${r.contact}`}
                        href={`mailto:${application.email}`}
                      >
                        {application.email}
                      </a>
                    </span>
                  </span>
                  {application.status === 'applied' ? (
                    <span className={`${u.btnRow} ${r.appAction}`}>
                      <button
                        type="button"
                        className={`${s.btnSecondary} ${u.sm}`}
                        aria-label={`Invite ${application.name}`}
                        onClick={() =>
                          router.replace(
                            `${hubTabHref(ONBOARDING_HUB, 'recruits')}&application=${encodeURIComponent(application.id)}`,
                            { scroll: false }
                          )
                        }
                      >
                        <UserPlus size={16} aria-hidden="true" />
                        Invite
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
