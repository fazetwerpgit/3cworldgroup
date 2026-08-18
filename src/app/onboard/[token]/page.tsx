'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingItem, RoleDisplayNames, FieldRole, requiresHeavyVetting } from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
import { isEsignItem, ESIGN_HELPER_TEXT } from '@/lib/onboarding/esign';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { US_STATES, isValidZip } from '@/lib/validation/address';

interface InviteView {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateCity: string;
  intendedFieldRole: FieldRole;
  isIBO: boolean;
  status: string;
  ownerName: string;
  expiresAt: string | null;
}

interface OnboardingResponse {
  invite: InviteView;
  items: OnboardingItem[];
  locked: boolean;
}

// Kicker line shared by every state on this pre-auth page (masthead + the
// three narrow-card states) — this page is public and cannot import
// PortalHeader/PortalSidebar/MemberLineShell, so the mark is a plain literal
// reproduction of the portal's navy/lime kicker treatment rather than the
// `.member-line-kicker` class, which needs a `.member-line` ancestor's CSS
// vars to resolve.
function OnboardKicker() {
  return (
    <p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#5a8f1f] dark:text-[#8dc63f]">
      3C World Group - Onboarding
    </p>
  );
}

export default function PublicOnboardingPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({
    displayName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    ssn: '',
    dlNumber: '',
    backgroundCheckAuth: false,
    password: '',
  });
  const [zipError, setZipError] = useState(false);
  const [references, setReferences] = useState<Record<string, string>>({});
  // dl_photos requires both slots before the reference (shared folder path) is
  // set. We only read the slots inside the setter's updater, so the value
  // binding itself is intentionally unused.
  const [, setDlSlots] = useState<{ front: string; back: string }>({
    front: '',
    back: '',
  });

  useEffect(() => {
    async function loadInvite() {
      try {
        const response = await fetch(`/api/public/onboarding/${token}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Could not load onboarding link');
        setData(json);
        setProfile({
          displayName: json.invite.candidateName || '',
          phone: json.invite.candidatePhone || '',
          address: '',
          city: json.invite.candidateCity || '',
          state: '',
          zip: '',
          ssn: '',
          dlNumber: '',
          backgroundCheckAuth: false,
          password: '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load onboarding link');
      } finally {
        setLoading(false);
      }
    }

    if (token) loadInvite();
  }, [token]);

  const updateReference = (itemId: string, value: string) => {
    setReferences((prev) => ({ ...prev, [itemId]: value }));
  };

  const markDlSlot = (slot: 'front' | 'back', folderPath: string) => {
    setDlSlots((prev) => {
      const next = { ...prev, [slot]: folderPath };
      // Reference is the shared folder path once both slots are present; empty
      // (incomplete) otherwise, so the completion + submit checks stay accurate.
      updateReference('dl_photos', next.front && next.back ? folderPath : '');
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/public/onboarding/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          references,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to submit onboarding');
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  // E-signature items are dispatched by the provider and complete via its
  // webhook, so they are not part of what the candidate fills in here and must
  // not hold the progress bar below 100%.
  const actionableItems = data ? data.items.filter((item) => !isEsignItem(item.id)) : [];
  const completed = actionableItems.filter((item) => references[item.id]?.trim()).length;
  const total = actionableItems.length;
  const roleLabel = data?.invite.intendedFieldRole
    ? RoleDisplayNames[data.invite.intendedFieldRole]
    : 'Field Representative';
  const heavyVetting = data ? requiresHeavyVetting(data.invite.intendedFieldRole) : false;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#E8F0F8] p-4 dark:bg-[#030916]">
        <div className="w-full max-w-md border border-[#0A1F44]/[.14] bg-white p-8 dark:border-white/[.14] dark:bg-[#08101d]">
          <OnboardKicker />
          <p className="mt-4 text-sm text-[#687384] dark:text-[#9caabd]">Loading onboarding link...</p>
          <div className="mt-5 space-y-2" aria-hidden="true">
            <Skeleton className="h-2.5 w-3/4 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
            <Skeleton className="h-2.5 w-1/2 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
            <Skeleton className="h-8 w-full rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#E8F0F8] p-4 dark:bg-[#030916]">
        <div className="w-full max-w-md border border-[#0A1F44]/[.14] bg-white p-8 text-center dark:border-white/[.14] dark:bg-[#08101d]">
          <OnboardKicker />
          <AlertTriangle className="mx-auto mt-4 mb-3 size-10 text-red-600" />
          <h1 className="text-lg font-semibold text-[#0A1F44] dark:text-[#f4f7fa]">Onboarding link unavailable</h1>
          <p className="mt-2 text-sm text-[#687384] dark:text-[#9caabd]">{error}</p>
          <Button asChild className="mt-5 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
            <Link href="/apply">Back to 3C</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (submitted || data?.locked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#E8F0F8] p-4 dark:bg-[#030916]">
        <div className="w-full max-w-xl border border-[#0A1F44]/[.14] bg-white p-8 text-center dark:border-white/[.14] dark:bg-[#08101d]">
          <OnboardKicker />
          <CheckCircle2 className="mx-auto mt-4 mb-4 size-12 text-[#5a8f1f] dark:text-[#8dc63f]" />
          <span className="inline-flex rounded-full border border-[#8dc63f] bg-[#8dc63f]/15 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[.12em] text-[#4f7f1e] dark:text-[#8dc63f]">
            Submitted
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-[#0A1F44] dark:text-[#f4f7fa]">
            Your onboarding packet is in review
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#687384] dark:text-[#9caabd]">
            Your manager can review this in the 3C portal. Your portal account is pending until management activates it.
          </p>
          <Button asChild className="mt-6 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
            <Link href="/portal">Go to Portal Login</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#E8F0F8] dark:bg-[#030916]">
      <div className="member-line">
        <OnboardKicker />

        <div className="member-line-masthead" style={{ paddingTop: 10 }}>
          <div>
            <h1>
              <span className="accent">{data?.invite.candidateName || 'Welcome'}.</span>
              <span>Finish your onboarding online.</span>
            </h1>
            <p className="member-line-intro">
              This link replaces document chasing by email. Complete each item here and submit it directly to management.
            </p>
          </div>
          <div
            className="member-line-display portal-metallic-num portal-num"
            aria-label={`${completed} of ${total} items complete`}
          >
            {completed}/{total}
          </div>
        </div>

        <form onSubmit={submit} className="portal-enter grid gap-5 pt-6 lg:grid-cols-[320px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="member-line-panel">
              <p className="member-line-eyebrow">candidate</p>
              <p style={{ marginTop: 8, fontWeight: 700, fontSize: 15 }}>{data?.invite.candidateName}</p>
              <p className="member-line-sub">{data?.invite.candidateEmail}</p>
              <p className="member-line-sub">
                {roleLabel}{data?.invite.isIBO ? ' / IBO' : ''}
              </p>

              <div className="member-line-progress" style={{ marginTop: 18 }}>
                <span style={{ width: total ? `${(completed / total) * 100}%` : '0%' }} />
              </div>
              <div className="member-line-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Progress</span>
                <span>{completed}/{total}</span>
              </div>

              <div
                className="member-line-note warn"
                style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}
              >
                <ShieldCheck className="size-4" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Do not enter SSNs, bank account numbers, or full card numbers. Use confirmation references only.
                </span>
              </div>
            </div>
          </aside>

          <section className="grid gap-5" style={{ alignContent: 'start' }}>
            {error && (
              <div
                className="member-line-note warn"
                role="alert"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
              >
                <AlertTriangle className="size-4" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="member-line-section-index">
              <b>01</b>
              <span>/ portal account</span>
            </div>

            <div className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <h2>Portal Account</h2>
                </div>
                <LockKeyhole className="size-5" style={{ color: 'var(--member-line-lime)' }} aria-hidden="true" />
              </div>

              <div className="member-line-profile-grid">
                <div className="member-line-field full">
                  <Label>Name</Label>
                  <Input
                    value={profile.displayName}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="member-line-field">
                  <Label>Phone</Label>
                  <Input
                    value={profile.phone}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="member-line-field full">
                  <Label>Street Address</Label>
                  <Input
                    value={profile.address}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, address: event.target.value }))
                    }
                  />
                </div>
                <div className="member-line-field">
                  <Label>City</Label>
                  <Input
                    value={profile.city}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, city: event.target.value }))
                    }
                  />
                </div>
                <div className="member-line-field">
                  <Label>State</Label>
                  <NativeSelect
                    value={profile.state}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, state: event.target.value }))
                    }
                    className="w-full rounded-none border-[#0A1F44]/20 dark:border-white/20"
                  >
                    <NativeSelectOption value="">Select state</NativeSelectOption>
                    {US_STATES.map((s) => (
                      <NativeSelectOption key={s.code} value={s.code}>
                        {s.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="member-line-field">
                  <Label>ZIP</Label>
                  <Input
                    value={profile.zip}
                    onChange={(event) => {
                      const zip = event.target.value;
                      setProfile((prev) => ({ ...prev, zip }));
                      // Clear a showing error as soon as the value becomes valid/empty.
                      if (zipError && (zip === '' || isValidZip(zip))) setZipError(false);
                    }}
                    onBlur={() => setZipError(profile.zip !== '' && !isValidZip(profile.zip))}
                    placeholder="12345"
                  />
                  {zipError && (
                    <p className="text-xs" style={{ color: 'var(--member-line-red)' }}>
                      Enter a valid ZIP (12345 or 12345-6789)
                    </p>
                  )}
                </div>
                {heavyVetting && (
                  <>
                    <div className="member-line-field">
                      <Label>Social Security Number</Label>
                      <Input
                        value={profile.ssn}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, ssn: event.target.value }))
                        }
                        placeholder="123-45-6789"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </div>
                    <div className="member-line-field">
                      <Label>Driver&apos;s License Number</Label>
                      <Input
                        value={profile.dlNumber}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, dlNumber: event.target.value }))
                        }
                        autoComplete="off"
                      />
                    </div>
                    <label
                      className="full"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--member-line-muted)' }}
                    >
                      <input
                        type="checkbox"
                        checked={profile.backgroundCheckAuth}
                        onChange={(event) =>
                          setProfile((prev) => ({ ...prev, backgroundCheckAuth: event.target.checked }))
                        }
                      />
                      I authorize a background / drug screen.
                    </label>
                    <p className="full member-line-sub" style={{ fontSize: 11 }}>
                      Your SSN and license number are encrypted and only visible to authorized administrators.
                    </p>
                  </>
                )}
                <div className="member-line-field full">
                  <Label>Create Portal Password</Label>
                  <Input
                    type="password"
                    minLength={6}
                    value={profile.password}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, password: event.target.value }))
                    }
                    required
                  />
                  <p className="member-line-sub" style={{ fontSize: 11 }}>
                    Your account stays pending until management reviews the packet.
                  </p>
                </div>
              </div>
            </div>

            <div className="member-line-section-index">
              <b>02</b>
              <span>/ required items</span>
            </div>

            <div className="member-line-panel">
              <div className="member-line-panel-head">
                <div>
                  <h2>Required Items</h2>
                </div>
                <ClipboardCheck className="size-5" style={{ color: 'var(--member-line-lime)' }} aria-hidden="true" />
              </div>

              <div className="member-line-board" style={{ marginTop: 16 }}>
                {data?.items.map((item, index) => {
                  const isComplete = references[item.id]?.trim();
                  return (
                    <div key={item.id} className="member-line-row" style={{ gridTemplateColumns: '1fr' }}>
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginBottom: 12,
                          }}
                        >
                          <div>
                            <strong>
                              {String(index + 1).padStart(2, '0')}. {item.label}
                            </strong>
                            <small>
                              {item.sensitive
                                ? 'Reference or confirmation only. Do not paste private numbers.'
                                : 'Confirm completion or add a short reference.'}
                            </small>
                          </div>
                          {isEsignItem(item.id) ? null : isComplete ? (
                            <span className="member-line-state done">Complete</span>
                          ) : (
                            <span className="member-line-state todo">Needed</span>
                          )}
                        </div>
                        {isStorageItem(item.id) ? (
                          item.id === 'dl_photos' ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <FileUpload
                                itemId="dl_photos"
                                slot="front"
                                label="Front of license"
                                accept="image/*"
                                allowedTypes={IMAGE_TYPES}
                                uploadUrl={`/api/public/onboarding/${token}/upload`}
                                onUploaded={(path) => markDlSlot('front', path)}
                              />
                              <FileUpload
                                itemId="dl_photos"
                                slot="back"
                                label="Back of license"
                                accept="image/*"
                                allowedTypes={IMAGE_TYPES}
                                uploadUrl={`/api/public/onboarding/${token}/upload`}
                                onUploaded={(path) => markDlSlot('back', path)}
                              />
                            </div>
                          ) : (
                            <FileUpload
                              itemId={item.id}
                              accept="image/*,application/pdf"
                              allowedTypes={DOC_TYPES}
                              uploadUrl={`/api/public/onboarding/${token}/upload`}
                              onUploaded={(path) => updateReference(item.id, path)}
                            />
                          )
                        ) : isEsignItem(item.id) ? (
                          <div className="grid gap-2">
                            <span className="member-line-chip" style={{ width: 'fit-content' }}>
                              E-signature
                            </span>
                            <p className="member-line-sub">{ESIGN_HELPER_TEXT}</p>
                          </div>
                        ) : (
                          <Textarea
                            value={references[item.id] || ''}
                            onChange={(event) => updateReference(item.id, event.target.value)}
                            placeholder={
                              item.sensitive
                                ? 'Example: Vendor confirmation, uploaded file reference, or manager note'
                                : 'Example: Completed, acknowledged, or upload/reference note'
                            }
                            required
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
              >
                {submitting ? 'Submitting...' : 'Submit Onboarding Packet'}
              </Button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
