'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { OnboardingItem, RoleDisplayNames, FieldRole, requiresHeavyVetting, SHIRT_SIZES } from '@/types';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
import { isEsignItem, ESIGN_HELPER_TEXT } from '@/lib/onboarding/esign';
import { uploadFormAttachment } from '@/lib/forms/uploadFormAttachment';
import { US_STATES, isValidZip } from '@/lib/validation/address';
import { AuthShell } from '@/components/auth/AuthShell';
import { Attachment, Field, FormAlert, FormSection, describe } from '@/components/portal/rep/RepForm';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import a from '@/components/auth/auth.module.css';
import o from '@/components/onboarding/onboarding.module.css';

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
  existingAccount?: boolean;
}

// Fields the POST can reject by name (its `field` key), and the control to mark.
const FIELD_INPUT_ID = {
  displayName: 'onboard-name',
  phone: 'onboard-phone',
  ssn: 'onboard-ssn',
  dlNumber: 'onboard-dl-number',
  shirtSize: 'onboard-shirt',
  backgroundCheckAuth: 'onboard-bg-auth',
  password: 'onboard-password',
} as const;
type PacketField = keyof typeof FIELD_INPUT_ID;

// Shown under a required box the browser finds empty on Submit: on a phone the
// native bubble alone is easy to miss and gone after one scroll.
const REQUIRED_MESSAGE: Record<PacketField, string> = {
  displayName: 'Enter your name',
  phone: 'Enter your phone number',
  ssn: 'Enter your Social Security number',
  dlNumber: "Enter your driver's license number",
  shirtSize: 'Pick a shirt size',
  backgroundCheckAuth: 'Check the box to authorize the background / drug screen',
  password: 'Create a password (6+ characters)',
};
const REFERENCE_REQUIRED = 'Add a reference or note';

// The invite-link onboarding packet, direction D. Public: the candidate has no
// account yet, so it sits on the pre-auth ground (AuthShell) and uses the rep
// forms kit for fields, uploads and the send error.
export default function PublicOnboardingPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // The send in flight, if any: a second tap never sends twice, and a page
  // restored from the back/forward cache can drop an answer that never came.
  const sendRef = useRef<AbortController | null>(null);
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
    shirtSize: '',
    backgroundCheckAuth: false,
    password: '',
  });
  const [zipError, setZipError] = useState(false);
  const [accountType, setAccountType] = useState('');
  const [taxClassification, setTaxClassification] = useState('');
  const [accountTypeError, setAccountTypeError] = useState(false);
  const [taxClassificationError, setTaxClassificationError] = useState(false);
  // Inline errors on named fields: the server's, or a required box left empty.
  // Keyed by PacketField, or `ref:<itemId>` for an item's reference box.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
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
          shirtSize: '',
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

  // iOS Safari can freeze the page mid-send (the candidate switches apps) and
  // later restore it from the back/forward cache with the request's answer
  // lost, which would leave Submit spinning forever. Drop that send and ask the
  // server whether the packet went in: if it did, show it as sent; if not,
  // Submit is ready again (the server refuses a second packet either way).
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !sendRef.current) return;
      sendRef.current.abort();
      sendRef.current = null;
      setSubmitting(false);
      void fetch(`/api/public/onboarding/${token}`, { cache: 'no-store' })
        .then(async (response) => {
          const json = await response.json();
          if (response.ok && json.locked) setData(json);
        })
        .catch(() => {});
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [token]);

  const markInvalid = (field: string, message: string) =>
    setFieldErrors((prev) => (prev[field] === message ? prev : { ...prev, [field]: message }));

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  type TextField = Exclude<keyof typeof profile, 'backgroundCheckAuth'>;
  const setText =
    (key: TextField) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setProfile((prev) => ({ ...prev, [key]: value }));
      clearFieldError(key);
    };

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

  // Multipart to the token's upload route: itemId, optional slot, file. No auth
  // header; the token in the URL is the credential.
  const upload = (itemId: string, allowedTypes: string[], slot?: string) => (file: File, signal: AbortSignal) =>
    uploadFormAttachment({
      file,
      itemId,
      slot,
      uploadUrl: `/api/public/onboarding/${token}/upload`,
      allowedTypes,
      signal,
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;

    const requiresAccountType = data.items.some((item) => item.id === 'direct_deposit');
    const requiresTaxClassification = data.items.some((item) => item.id === 'w9');
    const missingAccountType = requiresAccountType && !accountType;
    const missingTaxClassification = requiresTaxClassification && !taxClassification;
    if (missingAccountType || missingTaxClassification) {
      setAccountTypeError(missingAccountType);
      setTaxClassificationError(missingTaxClassification);
      return;
    }

    if (sendRef.current) return;
    const send = new AbortController();
    sendRef.current = send;
    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch(`/api/public/onboarding/${token}`, {
        method: 'POST',
        signal: send.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          references,
          ...(accountType ? { accountType } : {}),
          ...(taxClassification ? { taxClassification } : {}),
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        // A named field goes red in place and takes focus: it may be far above Submit.
        const field =
          typeof json.field === 'string' && Object.hasOwn(FIELD_INPUT_ID, json.field)
            ? (json.field as PacketField)
            : null;
        if (field && json.error) {
          setFieldErrors({ [field]: json.error });
          const input = document.getElementById(FIELD_INPUT_ID[field]);
          input?.focus({ preventScroll: true });
          input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        throw new Error(json.error || 'Failed to submit onboarding');
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // Dropped on a back/forward-cache restore: the pageshow handler took over.
      if (send.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to submit onboarding');
    } finally {
      if (sendRef.current === send) {
        sendRef.current = null;
        setSubmitting(false);
      }
    }
  };

  // E-signature items are dispatched by the provider and complete via its
  // webhook, so they are not part of what the candidate fills in here and must
  // not hold the progress bar below 100%.
  const actionableItems = data ? data.items.filter((item) => !isEsignItem(item.id)) : [];
  // The license item needs its typed number as well as both photos.
  const isItemComplete = (item: OnboardingItem) =>
    !!references[item.id]?.trim() && (item.id !== 'dl_photos' || !!profile.dlNumber.trim());
  const completed = actionableItems.filter(isItemComplete).length;
  const total = actionableItems.length;
  // E-sign items are signed in the portal after this form, so the count leaves them out.
  const signLater = data ? data.items.length - total : 0;
  const roleLabel = data?.invite.intendedFieldRole
    ? RoleDisplayNames[data.invite.intendedFieldRole]
    : 'Field Representative';
  const heavyVetting = data ? requiresHeavyVetting(data.invite.intendedFieldRole) : false;
  const zipMessage = zipError ? 'Enter a valid ZIP (12345 or 12345-6789)' : undefined;
  const accountTypeMessage = accountTypeError ? 'Select an account type' : undefined;
  const taxClassificationMessage = taxClassificationError ? 'Select a federal tax classification' : undefined;

  if (loading) {
    return (
      <AuthShell tag="Onboarding">
        <h1 className={a.title}>Onboarding</h1>
        <p className={a.sub} role="status">
          Loading onboarding link…
        </p>
        <div className={a.stack} aria-hidden="true">
          <span className={s.skel} style={{ width: '75%', height: 12 }} />
          <span className={s.skel} style={{ width: '50%', height: 12 }} />
          <span className={s.skel} style={{ height: 52 }} />
        </div>
      </AuthShell>
    );
  }

  if (error && !data) {
    return (
      <AuthShell tag="Onboarding">
        <span className={`${a.statusIcon} ${a.statusIconWarn}`} aria-hidden="true">
          <AlertTriangle size={22} />
        </span>
        <h1 className={a.title}>Onboarding link unavailable</h1>
        <p className={a.sub} role="alert">
          {error}
        </p>
        <div className={a.actions}>
          <Link href="/apply" className={`${s.btnPrimary} ${a.btn}`}>
            Back to 3C
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (submitted || data?.locked) {
    return (
      <AuthShell tag="Onboarding">
        <span className={a.statusIcon} aria-hidden="true">
          <Check size={22} />
        </span>
        {!data?.existingAccount && (
          <span className={o.state} data-state="submitted">
            Submitted
          </span>
        )}
        <h1 className={a.title}>
          {data?.existingAccount ? 'You already have a portal account' : 'Your onboarding packet is sent'}
        </h1>
        <p className={a.sub}>
          {data?.existingAccount
            ? `Sign in with ${data.invite.candidateEmail}. If you forgot your password, reset it from the login page.`
            : 'Next: sign in and sign your documents. Your manager reviews the rest.'}
        </p>
        <div className={a.actions}>
          <Link href="/portal" className={`${s.btnPrimary} ${a.btn}`}>
            Sign in to the portal
          </Link>
        </div>
        {data?.existingAccount && (
          <p className={a.linkRow}>
            <Link href="/portal" className={`${a.link} ${a.linkLime}`}>
              Use Forgot password on the login page
            </Link>
          </p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="Onboarding" wide>
      <div className={o.invite}>
        <header>
          <h1 className={a.title}>Finish your onboarding</h1>
          <p className={a.sub}>Complete each item here and submit it directly to management.</p>
        </header>

        <aside className={o.inviteAside} aria-labelledby="onboard-progress-h">
          <section className={s.panel}>
            <div className={o.progress}>
              <h2 id="onboard-progress-h" className={s.kicker}>
                Candidate
              </h2>
              <p className={o.candidate}>
                <strong>{data?.invite.candidateName}</strong>
                <span>{data?.invite.candidateEmail}</span>
                <span>{roleLabel}</span>
              </p>
              <p className={o.score}>
                <span className={`${o.scoreNum} ${total && completed === total ? o.progressDone : ''}`}>
                  {completed}
                </span>
                <span className={o.scoreOf}>/{total}</span>
                <span className={o.scoreLabel}>complete</span>
              </p>
              <span className={s.track} aria-hidden="true">
                <span className={s.fill} style={{ width: total ? `${(completed / total) * 100}%` : '0%' }} />
              </span>
              {signLater > 0 ? (
                <p className={f.hint}>
                  Plus {signLater} {signLater === 1 ? 'document' : 'documents'} you sign after you log in.
                </p>
              ) : null}
            </div>
          </section>
          <p className={`${o.note} ${o.noteWarn}`}>
            {heavyVetting
              ? 'Your SSN and license number are encrypted and only visible to the owners. In the reference boxes, use confirmation references only, never bank account or card numbers.'
              : 'Do not enter bank account or full card numbers. Use confirmation references only.'}
          </p>
        </aside>

        <form onSubmit={submit} className={f.form}>
          <FormSection title="Portal account">
            <Field id="onboard-name" label="Name" error={fieldErrors.displayName} required>
              <input
                id="onboard-name"
                className={f.input}
                value={profile.displayName}
                onChange={setText('displayName')}
                onInvalid={() => markInvalid('displayName', REQUIRED_MESSAGE.displayName)}
                autoComplete="name"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                required
                {...describe('onboard-name', fieldErrors.displayName)}
              />
            </Field>
            <Field id="onboard-phone" label="Phone" error={fieldErrors.phone} required>
              <input
                id="onboard-phone"
                type="tel"
                className={f.input}
                value={profile.phone}
                onChange={setText('phone')}
                onInvalid={() => markInvalid('phone', REQUIRED_MESSAGE.phone)}
                autoComplete="tel"
                required
                {...describe('onboard-phone', fieldErrors.phone)}
              />
            </Field>
            <Field id="onboard-address" label="Street address" wide>
              <input
                id="onboard-address"
                className={f.input}
                value={profile.address}
                onChange={setText('address')}
                autoComplete="address-line1"
                autoCapitalize="words"
              />
            </Field>
            <Field id="onboard-city" label="City">
              <input
                id="onboard-city"
                className={f.input}
                value={profile.city}
                onChange={setText('city')}
                autoComplete="address-level2"
                autoCapitalize="words"
              />
            </Field>
            <Field id="onboard-state" label="State">
              <span className={f.selectWrap}>
                <select
                  id="onboard-state"
                  className={f.input}
                  value={profile.state}
                  onChange={setText('state')}
                  autoComplete="address-level1"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </Field>
            <Field id="onboard-zip" label="ZIP" error={zipMessage}>
              <input
                id="onboard-zip"
                className={f.input}
                value={profile.zip}
                onChange={(event) => {
                  const zip = event.target.value;
                  setProfile((prev) => ({ ...prev, zip }));
                  // Clear a showing error as soon as the value becomes valid/empty.
                  if (zipError && (zip === '' || isValidZip(zip))) setZipError(false);
                }}
                onBlur={() => setZipError(profile.zip !== '' && !isValidZip(profile.zip))}
                placeholder="12345"
                inputMode="numeric"
                autoComplete="postal-code"
                {...describe('onboard-zip', zipMessage)}
              />
            </Field>
            <Field id="onboard-shirt" label="Shirt size" error={fieldErrors.shirtSize} required>
              <span className={f.selectWrap}>
                <select
                  id="onboard-shirt"
                  className={f.input}
                  value={profile.shirtSize}
                  onChange={setText('shirtSize')}
                  onInvalid={() => markInvalid('shirtSize', REQUIRED_MESSAGE.shirtSize)}
                  required
                  {...describe('onboard-shirt', fieldErrors.shirtSize)}
                >
                  <option value="">Select size</option>
                  {SHIRT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </Field>
            {heavyVetting && (
              <>
                <Field
                  id="onboard-ssn"
                  label="Social Security number"
                  hint="Your SSN is encrypted and only visible to the owners."
                  error={fieldErrors.ssn}
                  required
                  wide
                >
                  <input
                    id="onboard-ssn"
                    className={f.input}
                    value={profile.ssn}
                    onChange={setText('ssn')}
                    onInvalid={() => markInvalid('ssn', REQUIRED_MESSAGE.ssn)}
                    placeholder="123-45-6789"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    {...describe('onboard-ssn', fieldErrors.ssn, true)}
                  />
                </Field>
                <div className={`${f.field} ${f.wide} ${fieldErrors.backgroundCheckAuth ? f.fieldInvalid : ''}`}>
                  <div className={f.rows}>
                    <label className={f.row}>
                      <input
                        id="onboard-bg-auth"
                        type="checkbox"
                        checked={profile.backgroundCheckAuth}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setProfile((prev) => ({ ...prev, backgroundCheckAuth: checked }));
                          clearFieldError('backgroundCheckAuth');
                        }}
                        onInvalid={() => markInvalid('backgroundCheckAuth', REQUIRED_MESSAGE.backgroundCheckAuth)}
                        required
                        {...describe('onboard-bg-auth', fieldErrors.backgroundCheckAuth)}
                      />
                      <span className={`${f.radio} ${o.tick}`} aria-hidden="true">
                        {profile.backgroundCheckAuth ? <Check size={14} strokeWidth={3} /> : null}
                      </span>
                      <span className={f.choiceText}>I authorize a background / drug screen.</span>
                    </label>
                  </div>
                  {fieldErrors.backgroundCheckAuth ? (
                    <p id="onboard-bg-auth-error" className={f.fieldError}>
                      <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
                      {fieldErrors.backgroundCheckAuth}
                    </p>
                  ) : null}
                </div>
              </>
            )}
            <Field
              id="onboard-password"
              label="Create portal password"
              hint="Your account stays pending until management reviews the packet."
              error={fieldErrors.password}
              required
              wide
            >
              {/* The account's username, for the iPhone keychain: without it
                  a saved password is filed under no name. */}
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={data?.invite.candidateEmail ?? ''}
                readOnly
                hidden
              />
              <input
                id="onboard-password"
                type="password"
                className={f.input}
                minLength={6}
                value={profile.password}
                onChange={setText('password')}
                onInvalid={() => markInvalid('password', REQUIRED_MESSAGE.password)}
                autoComplete="new-password"
                required
                {...describe('onboard-password', fieldErrors.password, true)}
              />
            </Field>
          </FormSection>

          <section className={f.section} aria-labelledby="onboard-items-h">
            <h2 id="onboard-items-h" className={f.sectionHead}>
              Required items
            </h2>
            <ol className={o.inviteItems}>
              {data?.items.map((item, index) => {
                const esign = isEsignItem(item.id);
                const isComplete = isItemComplete(item);
                return (
                  <li key={item.id} className={`${s.panel} ${o.inviteItem}`}>
                    <div className={o.rowText}>
                      {esign ? (
                        <span className={o.state} data-state="submitted">
                          E-signature
                        </span>
                      ) : (
                        <span className={o.state} data-state={isComplete ? 'approved' : undefined}>
                          {isComplete ? 'Complete' : 'Needed'}
                        </span>
                      )}
                      <h3 className={o.rowName}>
                        {String(index + 1).padStart(2, '0')}. {item.label}
                      </h3>
                      <p className={o.rowDesc}>
                        {esign
                          ? ESIGN_HELPER_TEXT
                          : item.id === 'dl_photos'
                            ? 'Your license number and a photo of each side.'
                            : item.sensitive
                              ? 'Reference or confirmation only. Do not paste private numbers.'
                              : 'Confirm completion or add a short reference.'}
                      </p>
                    </div>

                    {isStorageItem(item.id) ? (
                      item.id === 'dl_photos' ? (
                        <>
                          <Field
                            id="onboard-dl-number"
                            label="License number"
                            hint="Encrypted. Only the owners can see it."
                            error={fieldErrors.dlNumber}
                            required
                          >
                            <input
                              id="onboard-dl-number"
                              className={f.input}
                              value={profile.dlNumber}
                              onChange={setText('dlNumber')}
                              onInvalid={() => markInvalid('dlNumber', REQUIRED_MESSAGE.dlNumber)}
                              maxLength={40}
                              autoComplete="off"
                              autoCapitalize="characters"
                              autoCorrect="off"
                              spellCheck={false}
                              required
                              {...describe('onboard-dl-number', fieldErrors.dlNumber, true)}
                            />
                          </Field>
                          <div className={o.slots}>
                            <Attachment
                              id="onboard-dl-front"
                              label="Front of license"
                              accept="image/*"
                              kinds="Photo"
                              preview={false}
                              upload={upload('dl_photos', IMAGE_TYPES, 'front')}
                              onUploaded={(path) => markDlSlot('front', path)}
                            />
                            <Attachment
                              id="onboard-dl-back"
                              label="Back of license"
                              accept="image/*"
                              kinds="Photo"
                              preview={false}
                              upload={upload('dl_photos', IMAGE_TYPES, 'back')}
                              onUploaded={(path) => markDlSlot('back', path)}
                            />
                          </div>
                        </>
                      ) : (
                        <Attachment
                          id={`onboard-upload-${item.id}`}
                          label="File"
                          accept="image/*,application/pdf"
                          preview={!item.sensitive}
                          upload={upload(item.id, DOC_TYPES)}
                          onUploaded={(path) => updateReference(item.id, path)}
                        />
                      )
                    ) : esign ? (
                      <>
                        {item.id === 'direct_deposit' && (
                          <Field
                            id="onboard-account-type"
                            label="Account type"
                            error={accountTypeMessage}
                            required
                          >
                            <span className={f.selectWrap}>
                              <select
                                id="onboard-account-type"
                                className={f.input}
                                value={accountType}
                                onChange={(event) => {
                                  setAccountType(event.target.value);
                                  if (event.target.value) setAccountTypeError(false);
                                }}
                                onBlur={() => setAccountTypeError(!accountType)}
                                onInvalid={(event) => {
                                  event.preventDefault();
                                  setAccountTypeError(true);
                                }}
                                required
                                {...describe('onboard-account-type', accountTypeMessage)}
                              >
                                <option value="">Select account type</option>
                                <option value="checking">Checking</option>
                                <option value="savings">Savings</option>
                              </select>
                              <ChevronDown size={18} aria-hidden="true" />
                            </span>
                          </Field>
                        )}
                        {item.id === 'w9' && (
                          <Field
                            id="onboard-tax-classification"
                            label="Federal tax classification"
                            error={taxClassificationMessage}
                            required
                          >
                            <span className={f.selectWrap}>
                              <select
                                id="onboard-tax-classification"
                                className={f.input}
                                value={taxClassification}
                                onChange={(event) => {
                                  setTaxClassification(event.target.value);
                                  if (event.target.value) setTaxClassificationError(false);
                                }}
                                onBlur={() => setTaxClassificationError(!taxClassification)}
                                onInvalid={(event) => {
                                  event.preventDefault();
                                  setTaxClassificationError(true);
                                }}
                                required
                                {...describe('onboard-tax-classification', taxClassificationMessage)}
                              >
                                <option value="">Select tax classification</option>
                                <option value="individual">Individual / sole proprietor</option>
                                <option value="llc">LLC</option>
                              </select>
                              <ChevronDown size={18} aria-hidden="true" />
                            </span>
                          </Field>
                        )}
                      </>
                    ) : (
                      <Field
                        id={`onboard-ref-${item.id}`}
                        label="Reference or note"
                        error={fieldErrors[`ref:${item.id}`]}
                        required
                      >
                        <textarea
                          id={`onboard-ref-${item.id}`}
                          className={`${f.input} ${f.textarea}`}
                          value={references[item.id] || ''}
                          onChange={(event) => {
                            updateReference(item.id, event.target.value);
                            clearFieldError(`ref:${item.id}`);
                          }}
                          onInvalid={() => markInvalid(`ref:${item.id}`, REFERENCE_REQUIRED)}
                          placeholder={
                            item.sensitive
                              ? 'Example: Vendor confirmation, uploaded file reference, or manager note'
                              : 'Example: Completed, acknowledged, or upload/reference note'
                          }
                          rows={3}
                          required
                          {...describe(`onboard-ref-${item.id}`, fieldErrors[`ref:${item.id}`])}
                        />
                      </Field>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <div className={o.inviteActions}>
            {error ? <FormAlert message={error} /> : null}
            <button type="submit" disabled={submitting} className={`${s.btnPrimary} ${o.submit}`}>
              {submitting ? (
                <>
                  <LoaderCircle size={18} className={f.spin} aria-hidden="true" />
                  Submitting
                </>
              ) : (
                'Submit onboarding packet'
              )}
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
