// Onboarding items on hold until 3C supplies the real documents (Jacob 9/24):
// the FCRA and Compensation PDFs in assets/esign are placeholders, and a signed
// placeholder is not a real authorization. A held item is not on anyone's
// checklist, is never sent for signature, cannot be signed from an old link,
// and does not count toward activation. Owners still see any progress a hire
// already has on one in Onboarding Review. Remove an id here once its real PDF
// is in place.
const HELD_ITEMS: Readonly<Record<string, true>> = {
  fcra_auth: true,
  pay_structure: true,
};

// Its own module so tests can lift the hold with
// vi.mock('@/types/onboardingHold') and exercise the full document set.
export function isHeldOnboardingItem(itemId: string): boolean {
  return HELD_ITEMS[itemId] === true;
}
