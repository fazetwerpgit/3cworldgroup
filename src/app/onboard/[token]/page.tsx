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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OnboardingItem, RoleDisplayNames, FieldRole } from '@/types';
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

  const completed = data
    ? data.items.filter((item) => references[item.id]?.trim()).length
    : 0;
  const total = data?.items.length ?? 0;
  const roleLabel = data?.invite.intendedFieldRole
    ? RoleDisplayNames[data.invite.intendedFieldRole]
    : 'Field Representative';

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-600">
            Loading onboarding link...
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-red-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 size-10 text-red-600" />
            <h1 className="text-lg font-semibold text-slate-950">Onboarding link unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <Button asChild className="mt-5 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/apply">Back to 3C</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (submitted || data?.locked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-xl border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 size-12 text-[#5a8f1f]" />
            <Badge variant="outline" className="border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e]">
              Submitted
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold text-slate-950">
              Your onboarding packet is in review
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your manager can review this in the 3C portal. Your portal account is pending until management activates it.
            </p>
            <Button asChild className="mt-6 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
              <Link href="/portal">Go to Portal Login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#0A1F44] text-sm font-black text-white">
              3C
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Recruit Onboarding
              </span>
              <span className="block text-sm font-semibold text-[#0A1F44]">
                Website invite flow
              </span>
            </span>
          </Link>
          <Badge variant="outline" className="hidden rounded-md border-[#8dc63f]/30 bg-[#8dc63f]/10 text-[#4f7f1e] sm:inline-flex">
            Secure manager review
          </Badge>
        </div>
      </div>

      <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="portal-panel portal-rail rounded-lg py-0 shadow-sm">
            <CardHeader>
              <Badge variant="secondary" className="w-fit rounded-md">
                3C Onboarding
              </Badge>
              <CardTitle className="mt-3 text-2xl text-slate-950">
                Finish your onboarding online
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <p>
                This link replaces document chasing by email. Complete each item here and submit it directly to management.
              </p>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{data?.invite.candidateName}</p>
                <p>{data?.invite.candidateEmail}</p>
                <p>{roleLabel}{data?.invite.isIBO ? ' / IBO' : ''}</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Progress</span>
                  <span>{completed}/{total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-[#8dc63f] transition-all duration-300"
                    style={{ width: total ? `${(completed / total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <ShieldCheck className="size-4" />
                <AlertDescription>
                  Do not enter SSNs, bank account numbers, or full card numbers. Use confirmation references only.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-5">
          {error && (
            <Alert className="border-red-200 bg-red-50 text-red-800">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card className="border-slate-200 py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 p-5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LockKeyhole className="size-5 text-[#0A1F44]" />
                Portal Account
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={profile.displayName}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={profile.phone}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={profile.address}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, address: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={profile.city}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, city: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>State</Label>
                <NativeSelect
                  value={profile.state}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, state: event.target.value }))
                  }
                  className="w-full"
                >
                  <NativeSelectOption value="">Select state</NativeSelectOption>
                  {US_STATES.map((s) => (
                    <NativeSelectOption key={s.code} value={s.code}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div>
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
                  <p className="mt-1 text-xs text-red-600">
                    Enter a valid ZIP (12345 or 12345-6789)
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
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
                <p className="mt-1 text-xs text-slate-500">
                  Your account stays pending until management reviews the packet.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 p-5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="size-5 text-[#0A1F44]" />
                Required Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {data?.items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 transition-colors duration-200 hover:border-slate-300"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {index + 1}. {item.label}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.sensitive
                          ? 'Reference or confirmation only. Do not paste private numbers.'
                          : 'Confirm completion or add a short reference.'}
                      </p>
                    </div>
                    {references[item.id]?.trim() ? (
                      <Badge className="bg-[#8dc63f]/15 text-[#4f7f1e] hover:bg-[#8dc63f]/15">
                        Complete
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 text-slate-500">
                        Needed
                      </Badge>
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
                    <div className="space-y-2">
                      <Badge variant="outline" className="border-[#0A1F44]/30 bg-[#0A1F44]/5 text-[#0A1F44]">
                        Adobe Sign
                      </Badge>
                      <p className="text-xs text-slate-500">{ESIGN_HELPER_TEXT}</p>
                      <Textarea
                        value={references[item.id] || ''}
                        onChange={(event) => updateReference(item.id, event.target.value)}
                        placeholder="Adobe Sign confirmation"
                        required
                      />
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
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
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
    </main>
  );
}
