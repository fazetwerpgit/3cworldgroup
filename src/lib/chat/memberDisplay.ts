// Display-only fields for a users/{uid} doc, shared by the chat routes that list
// people (members, read-by). Never returns emails or raw role data.

/** displayName, else the local-part of the email, else a neutral fallback. */
export function memberName(data: FirebaseFirestore.DocumentData): string {
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (displayName) return displayName;
  const email = typeof data.email === 'string' ? data.email : '';
  const localPart = email.split('@')[0]?.trim();
  return localPart || '3C User';
}

/** Only a well-formed string survives — never leak a malformed avatarUrl field. */
export function memberAvatarUrl(data: FirebaseFirestore.DocumentData): string | undefined {
  return typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : undefined;
}
