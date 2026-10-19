/**
 * The body Settings sends to PUT /api/portal/profile.
 *
 * Phone goes only when the rep changed it. The profile on screen can be the
 * one the device remembered (sessionProfile), which never stores phone, so the
 * field starts blank; sending that blank would wipe the phone on file.
 * Shirt size goes only once picked: empty means never picked.
 */
export function profileSaveBody(
  form: { displayName: string; phone: string; shirtSize: string },
  loaded: { phone?: string | null },
): { displayName: string; phone?: string; shirtSize?: string } {
  return {
    displayName: form.displayName,
    ...(form.phone.trim() !== (loaded.phone ?? '').trim() ? { phone: form.phone } : {}),
    ...(form.shirtSize ? { shirtSize: form.shirtSize } : {}),
  };
}
