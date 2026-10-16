// Where a user's pushes go, read from their users doc. Pure (no Firebase
// imports) so routes and fan-outs can share it without pulling in messaging.

/** A user's devices: browser / PWA (web push) and 3C iOS app (APNs via FCM). */
export interface PushTargets {
  web: string[];
  native: string[];
}

/** The platform tag stored with each native token (users/{uid}.nativePushTokens[]). */
export const NATIVE_PUSH_PLATFORM = 'ios-native' as const;

export interface NativePushTokenEntry {
  token: string;
  platform: typeof NATIVE_PUSH_PLATFORM;
}

function cleanTokens(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((t: unknown): t is string => typeof t === 'string' && !!t) : [];
}

/** Every device token on a users doc, split by platform. */
export function pushTargetsOf(data: Record<string, unknown> | undefined | null): PushTargets {
  const native = Array.isArray(data?.nativePushTokens)
    ? (data.nativePushTokens as unknown[])
        .map((entry) =>
          entry && typeof entry === 'object' && (entry as { platform?: unknown }).platform === NATIVE_PUSH_PLATFORM
            ? (entry as { token?: unknown }).token
            : undefined
        )
        .filter((t): t is string => typeof t === 'string' && !!t)
    : [];
  return { web: cleanTokens(data?.pushTokens), native };
}

/** The exact array element a native token is stored as (arrayUnion/arrayRemove match on it). */
export function nativeTokenEntry(token: string): NativePushTokenEntry {
  return { token, platform: NATIVE_PUSH_PLATFORM };
}

