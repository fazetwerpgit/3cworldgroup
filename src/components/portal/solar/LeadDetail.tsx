'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { StatusDot } from '@/components/portal/admin-d/AdminUi';
import { useAttachmentViewer } from '@/components/portal/rep/ImageViewer';
import { isPdfUrl } from '@/lib/forms/openAttachment';
import ops from '@/components/portal/admin-ops/admin-ops.module.css';
import kit from '@/components/portal/admin-ops/admin-kit.module.css';
import { photoUrl, type SolarLeadView } from './solarClient';
import {
  CREDIT_LABEL,
  PHOTO_LABELS,
  STATUS_LABEL,
  STATUS_TONE,
  billLine,
  consultTime,
  kwhLine,
  leadAddress,
  modeLabel,
  roofLabel,
  savedDate,
  stageLine,
} from './leadDisplay';
import css from './solar-leads.module.css';

type PhotoState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' } | { status: 'failed' };

/** Signed links for the lead's photos, fetched once per lead (they last 15 minutes). */
function usePhotoUrls(photos: SolarLeadView['photos']) {
  const key = PHOTO_LABELS.map(({ slot }) => photos[slot] ?? '').join('|');
  const [state, setState] = useState<{ key: string; urls: Partial<Record<string, PhotoState>> }>({ key: '', urls: {} });

  useEffect(() => {
    let live = true;
    for (const { slot } of PHOTO_LABELS) {
      const path = photos[slot];
      if (!path) continue;
      photoUrl(path).then(
        (url) => {
          if (!live) return;
          setState((prev) => ({
            key,
            urls: { ...(prev.key === key ? prev.urls : {}), [slot]: url ? { status: 'ready', url } : { status: 'missing' } },
          }));
        },
        () => {
          if (!live) return;
          setState((prev) => ({ key, urls: { ...(prev.key === key ? prev.urls : {}), [slot]: { status: 'failed' } } }));
        }
      );
    }
    return () => {
      live = false;
    };
    // The paths are the dependency; `key` captures them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (slot: string): PhotoState => {
    if (!photos[slot as keyof typeof photos]) return { status: 'missing' };
    return (state.key === key ? state.urls[slot] : undefined) ?? { status: 'loading' };
  };
}

/**
 * A solar lead's details: contact, bill, stage, roof and usage, the photos (tap to view), the
 * consultation and who saved it. Read only; the admin sheet adds the status
 * actions in its footer.
 */
export function LeadDetail({
  lead,
  showRep = true,
  showStage = true,
  reviewAction,
}: {
  lead: SolarLeadView;
  showRep?: boolean;
  /** Off where the stage is already shown as a picker (the admin sheet). */
  showStage?: boolean;
  /** The admin sheet's Mark reviewed, set beside the reason it needs review. */
  reviewAction?: ReactNode;
}) {
  const photo = usePhotoUrls(lead.photos);
  const viewer = useAttachmentViewer();
  const address = leadAddress(lead);
  const bill = billLine(lead.monthlyBill);
  const booking = lead.booking;
  const stage = stageLine(lead);
  const kwh = kwhLine(lead.monthlyKwh);
  const addedPhotos = PHOTO_LABELS.filter(({ slot }) => lead.photos[slot]);
  const missingPhotos = PHOTO_LABELS.filter(({ slot }) => !lead.photos[slot]);

  return (
    <div className={ops.detail}>
      {lead.needsReview && showRep ? (
        <div className={css.reviewNote} role="note">
          <span className={css.reviewBadge}>Needs review</span>
          <p className={css.reviewWhy}>
            {lead.heavyShade ? 'Heavy shade on the roof. Look before the consultation.' : 'Look before the consultation.'}
          </p>
          {reviewAction}
        </div>
      ) : null}
      <dl className={ops.fields}>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusDot tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusDot>
          </dd>
        </div>
        {showStage ? (
          <div>
            <dt>Stage</dt>
            <dd>{stage ? <StatusDot tone={stage.tone}>{stage.text}</StatusDot> : 'Not set'}</dd>
          </div>
        ) : null}
        <div>
          <dt>Phone</dt>
          <dd>{lead.phone ? <a className={css.link} href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a> : 'None'}</dd>
        </div>
        <div className={ops.fieldWide}>
          <dt>Email</dt>
          <dd>{lead.email ? <a className={css.link} href={`mailto:${lead.email}`}>{lead.email}</a> : 'None'}</dd>
        </div>
        <div className={ops.fieldWide}>
          <dt>Address</dt>
          <dd>{address || 'None'}</dd>
        </div>
        <div>
          <dt>Electric bill</dt>
          <dd>{bill || 'Not entered'}</dd>
        </div>
        <div>
          <dt>Credit</dt>
          <dd>{lead.creditTier ? CREDIT_LABEL[lead.creditTier] : 'Not picked'}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>{kwh || 'Not entered'}</dd>
        </div>
        <div>
          <dt>Roof</dt>
          <dd>{roofLabel(lead.roofType) || 'Not entered'}</dd>
        </div>
        <div>
          <dt>Heavy shade</dt>
          <dd>{lead.heavyShade === null ? 'Not asked' : lead.heavyShade ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      <section className={ops.section} aria-label="Photos">
        <h3 className={kit.sectionTitle}>Photos</h3>
        {missingPhotos.length === PHOTO_LABELS.length ? (
          <p className={css.quiet}>No photos added.</p>
        ) : (
        <ul className={css.photos}>
          {addedPhotos.map(({ slot, label }) => {
            const p = photo(slot);
            return (
              <li key={slot}>
                {p.status === 'ready' && isPdfUrl(p.url) ? (
                  // A bill sent as a PDF: a plain link that opens it in a new tab.
                  <a
                    className={`${css.photo} ${css.photoPdf}`}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${label.toLowerCase()} (PDF)`}
                  >
                    <FileText size={22} aria-hidden="true" />
                    <span>PDF</span>
                    <span className={css.photoPdfOpen}>Open</span>
                  </a>
                ) : p.status === 'ready' ? (
                  <button
                    type="button"
                    className={css.photo}
                    onClick={(event) => viewer.show(p.url, label, event.currentTarget)}
                    aria-label={`View ${label.toLowerCase()}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a 15-minute signed link */}
                    <img src={p.url} alt="" className={css.photoImg} loading="lazy" />
                  </button>
                ) : (
                  <span className={css.photo} data-state={p.status}>
                    {p.status === 'loading' ? (
                      <span className={css.photoSkel} aria-label="Loading photo" />
                    ) : (
                      <span className={css.photoNone}>
                        <ImageOff size={18} aria-hidden="true" />
                        {p.status === 'failed' ? 'Couldn’t load' : 'Not added'}
                      </span>
                    )}
                  </span>
                )}
                <span className={css.photoLabel}>{label}</span>
              </li>
            );
          })}
        </ul>
        )}
        {missingPhotos.length > 0 && missingPhotos.length < PHOTO_LABELS.length ? (
          <p className={css.quiet}>Not added: {missingPhotos.map((p) => p.label).join(', ')}.</p>
        ) : null}
      </section>

      <section className={ops.section} aria-label="Consultation">
        <h3 className={kit.sectionTitle}>Consultation</h3>
        {booking ? (
          <dl className={ops.fields}>
            <div className={ops.fieldWide}>
              <dt>When</dt>
              <dd>{consultTime(booking)}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{modeLabel(booking.mode)}</dd>
            </div>
            <div>
              <dt>Consultant</dt>
              <dd>{booking.consultantName}</dd>
            </div>
          </dl>
        ) : (
          <p className={css.quiet}>Not booked.</p>
        )}
      </section>

      <dl className={ops.fields}>
        {showRep ? (
          <div>
            <dt>Rep</dt>
            <dd>
              {lead.repName || 'Unknown'}
              <span className={ops.ddSub}>{lead.source === 'knock' ? '3C Doors' : 'Solar deck'}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Saved</dt>
          <dd>{savedDate(lead.createdAt) || 'Unknown'}</dd>
        </div>
      </dl>
      {viewer.viewer}
    </div>
  );
}
