// Some legacy user docs store the address under 'Email' (capital E) instead of
// 'email' — reading only the lowercase field silently drops those users from
// email fan-outs (this is how an owner missed recruit-application alerts).
// Every sender that resolves a user doc to an address goes through this.
export function emailFromUserDoc(snap: { get: (field: string) => unknown }): string | undefined {
  const raw = snap.get('email') ?? snap.get('Email');
  if (typeof raw !== 'string') return undefined;
  const email = raw.trim();
  return email && email.includes('@') ? email : undefined;
}
