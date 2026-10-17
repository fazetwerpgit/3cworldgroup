import { isNativeApp } from './isNativeApp';

// The web side of the 3C Portal app bridge (docs/ios-app/BRIDGE.md is the
// contract the Expo shell is built against; keep the two in step).
//
// web -> native: window.ReactNativeWebView.postMessage(JSON.stringify(message))
// native -> web: the shell calls window.__3C_BRIDGE__.receive(message) through
//   injectJavaScript (preferred), or posts a DOM "message" event whose data is
//   the message (object or JSON string). Every native message carries
//   source: '3c-shell'; anything else on the message channel is ignored.
//
// Requests that expect an answer carry an `id`; the shell answers each with
// exactly one { type: 'reply', id, ok, ... }. Fire-and-forget messages
// (haptic, openExternal, nativeSignOut) carry no id and get no reply.

export const BRIDGE_VERSION = 1;
export const NATIVE_SOURCE = '3c-shell';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';
export type NativeSignInProvider = 'google' | 'apple';
export type NativePushPermission = 'granted' | 'denied' | 'undetermined';

/** Error codes a failed reply may carry. */
export type NativeErrorCode =
  | 'canceled' // the person dismissed the native sheet / prompt
  | 'denied' // the OS permission is off
  | 'not_configured' // the native side is missing setup (e.g. Sign in with Apple keys)
  | 'unsupported' // this shell version does not handle the message type
  | 'failed'; // anything else

// ---- web -> native -------------------------------------------------------

export interface PushTokenRequest {
  type: 'pushToken';
  id: string;
  /** true only from a user tap: the shell may show the iOS permission prompt. */
  prompt: boolean;
}
export interface ShareRequest {
  type: 'share';
  id: string;
  url?: string;
  text?: string;
  title?: string;
}
export interface SaveFileRequest {
  type: 'saveFile';
  id: string;
  filename: string;
  mimeType: string;
  /** The file's bytes, base64 (no data: prefix). The shell writes it and opens the share sheet. */
  base64: string;
}
export interface BiometricLockRequest {
  type: 'biometricLock';
  id: string;
  /** Omit to read the current setting; true/false to change it. */
  enabled?: boolean;
}
export interface NativeSignInRequest {
  type: 'nativeSignIn';
  id: string;
  provider: NativeSignInProvider;
  /**
   * Apple only: SHA-256 (lowercase hex) of a raw nonce the web keeps. The shell
   * passes it to Apple as the request nonce. The raw nonce never leaves the web.
   */
  nonce?: string;
}
export interface HapticMessage {
  type: 'haptic';
  style: HapticStyle;
}
export interface OpenExternalMessage {
  type: 'openExternal';
  /** Absolute URL: https (Safari / in-app browser), tel:, mailto:, sms:, maps: ... */
  url: string;
}

/** The web's sign-in, handed to the shell's native Firebase Auth (native chat). */
export interface NativeAuthRequest {
  type: 'nativeAuth';
  id: string;
  /** Firebase custom token for the signed-in uid (POST /api/portal/auth/custom-token). */
  customToken: string;
}
/** The web signed out (or loaded signed out): sign the native Firebase Auth out too. */
export interface NativeSignOutMessage {
  type: 'nativeSignOut';
}
/** Open the native chat screen instead of /portal/chat. Sent only when the shell advertised nativeChat. */
export interface OpenNativeChatRequest {
  type: 'openNativeChat';
  id: string;
  /** The channel to open (from /portal/chat?channel=<id>); omitted for the channel list. */
  channelId?: string;
}

export type BridgeRequest =
  | PushTokenRequest
  | ShareRequest
  | SaveFileRequest
  | BiometricLockRequest
  | NativeSignInRequest
  | NativeAuthRequest
  | OpenNativeChatRequest;
export type BridgeEvent = HapticMessage | OpenExternalMessage | NativeSignOutMessage;
export type WebToNativeMessage = BridgeRequest | BridgeEvent;

// ---- native -> web -------------------------------------------------------

export interface PushTokenResult {
  /** APNs-backed FCM registration token, or null when permission is not granted. */
  token: string | null;
  permission: NativePushPermission;
}
export interface CompletedResult {
  /** false when the person closed the share sheet without acting. */
  completed: boolean;
}
export interface BiometricLockResult {
  enabled: boolean;
  /** false when the device has no Face ID / Touch ID enrolled. */
  available: boolean;
}
export type NativeSignInResult =
  | { provider: 'google'; idToken: string; accessToken?: string }
  | {
      provider: 'apple';
      idToken: string;
      /** Apple shares the name only on the very first authorization. */
      fullName?: { givenName?: string | null; familyName?: string | null } | null;
      email?: string | null;
    };

export interface BridgeResultMap {
  pushToken: PushTokenResult;
  share: CompletedResult;
  saveFile: CompletedResult;
  biometricLock: BiometricLockResult;
  nativeSignIn: NativeSignInResult;
  /** ok once the shell's native Firebase Auth signed in with the custom token. */
  nativeAuth: unknown;
  /** ok once the native chat screen is showing. */
  openNativeChat: unknown;
}

export type BridgeRequestType = BridgeRequest['type'];

export interface ReplySuccess {
  source: typeof NATIVE_SOURCE;
  type: 'reply';
  id: string;
  ok: true;
  result?: unknown;
}
export interface ReplyFailure {
  source: typeof NATIVE_SOURCE;
  type: 'reply';
  id: string;
  ok: false;
  error: string;
  code?: NativeErrorCode;
}
/** Unsolicited: the device's push token changed (or was first issued). */
export interface PushTokenEvent {
  source: typeof NATIVE_SOURCE;
  type: 'pushToken';
  token: string;
}
/** Features this shell build supports beyond contract v1. Unknown keys are dropped. */
export interface AppCapabilities {
  /** The shell has a native chat screen and accepts openNativeChat. */
  nativeChat?: boolean;
}
/** Unsolicited: what this shell build can do. May be sent again; the latest wins. */
export interface CapabilitiesEvent {
  source: typeof NATIVE_SOURCE;
  type: 'capabilities';
  capabilities: AppCapabilities;
}
export type NativeToWebMessage = ReplySuccess | ReplyFailure | PushTokenEvent | CapabilitiesEvent;

const ERROR_CODES: readonly NativeErrorCode[] = ['canceled', 'denied', 'not_configured', 'unsupported', 'failed'];

export class NativeBridgeError extends Error {
  readonly code: NativeErrorCode | 'timeout' | 'no_bridge';
  constructor(code: NativeBridgeError['code'], message: string) {
    super(message);
    this.name = 'NativeBridgeError';
    this.code = code;
  }
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    __3C_BRIDGE__?: { version: number; receive: (message: unknown) => void };
    /** Optional: the shell may inject its capabilities before content loads. */
    __3C_APP_CAPS__?: AppCapabilities;
  }
}

/** Keeps only the known boolean capability flags. Null if `raw` is not an object. */
export function parseCapabilities(raw: unknown): AppCapabilities | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const caps: AppCapabilities = {};
  if (typeof c.nativeChat === 'boolean') caps.nativeChat = c.nativeChat;
  return caps;
}

/** Validates anything that arrived on the message channel. Null if it is not ours. */
export function parseNativeMessage(raw: unknown): NativeToWebMessage | null {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.source !== NATIVE_SOURCE) return null;
  if (m.type === 'reply') {
    if (typeof m.id !== 'string' || !m.id) return null;
    if (m.ok === true) return { source: NATIVE_SOURCE, type: 'reply', id: m.id, ok: true, result: m.result };
    if (m.ok === false) {
      const code = ERROR_CODES.includes(m.code as NativeErrorCode) ? (m.code as NativeErrorCode) : undefined;
      return {
        source: NATIVE_SOURCE,
        type: 'reply',
        id: m.id,
        ok: false,
        error: typeof m.error === 'string' && m.error ? m.error : 'The app could not finish that.',
        ...(code ? { code } : {}),
      };
    }
    return null;
  }
  if (m.type === 'pushToken') {
    if (typeof m.token !== 'string' || !m.token) return null;
    return { source: NATIVE_SOURCE, type: 'pushToken', token: m.token };
  }
  if (m.type === 'capabilities') {
    const caps = parseCapabilities(m.capabilities);
    if (!caps) return null;
    return { source: NATIVE_SOURCE, type: 'capabilities', capabilities: caps };
  }
  return null;
}

/** True when the shell's postMessage channel is present. */
export function hasNativeBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.ReactNativeWebView?.postMessage === 'function';
}

/**
 * Sends one message to the shell. Returns false (and sends nothing) outside
 * the app or when the channel is missing, so callers can fall back to the web.
 */
export function postToNative(message: WebToNativeMessage): boolean {
  if (!isNativeApp() || !hasNativeBridge()) return false;
  try {
    window.ReactNativeWebView!.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

type Listener = (message: NativeToWebMessage) => void;
const listeners = new Set<Listener>();
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: NativeBridgeError) => void; timer: ReturnType<typeof setTimeout> }
>();
let installed = false;

/** Feeds one inbound message through the bridge. Exported for the receiver and tests. */
export function receiveNativeMessage(raw: unknown): void {
  const message = parseNativeMessage(raw);
  if (!message) return;
  if (message.type === 'reply') {
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new NativeBridgeError(message.code ?? 'failed', message.error));
    }
  }
  for (const listener of listeners) {
    try {
      listener(message);
    } catch (err) {
      console.error('[bridge] listener failed', err);
    }
  }
}

/** Installs the native -> web receiver once. A no-op outside the browser. */
export function installNativeReceiver(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // A DOM message event is trusted only from this window itself (the shell's
  // own postMessage / injected dispatch). Anything with another source, e.g.
  // an embedded iframe or a window this page opened, is dropped, so it can
  // neither spoof a reply nor push a token.
  const onMessage = (event: Event) => {
    const source = (event as MessageEvent).source;
    if (source !== null && source !== undefined && source !== window) return;
    receiveNativeMessage((event as MessageEvent).data);
  };
  window.addEventListener('message', onMessage);
  // react-native-webview's own postMessage lands on document in some versions.
  document.addEventListener('message', onMessage as EventListener);
  window.__3C_BRIDGE__ = { version: BRIDGE_VERSION, receive: receiveNativeMessage };
}

/** Subscribes to every validated native -> web message. Returns the unsubscribe. */
export function onNativeMessage(listener: Listener): () => void {
  installNativeReceiver();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let counter = 0;
function nextId(): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `w${Date.now().toString(36)}${counter}${rand}`;
}

type RequestBody<T extends BridgeRequestType> = Omit<Extract<BridgeRequest, { type: T }>, 'id'>;

/** Default reply wait. Native sheets the person is looking at get longer. */
const DEFAULT_TIMEOUT_MS: Record<BridgeRequestType, number> = {
  pushToken: 60_000,
  share: 10 * 60_000,
  saveFile: 10 * 60_000,
  biometricLock: 60_000,
  nativeSignIn: 5 * 60_000,
  nativeAuth: 15_000,
  // Short: on no answer the web falls back to its own chat page.
  openNativeChat: 1_500,
};

/**
 * Sends a request and resolves with the shell's result. Rejects with a
 * NativeBridgeError: 'no_bridge' outside the app, 'timeout' with no reply, or
 * the code from a failed reply.
 */
export function requestNative<T extends BridgeRequestType>(
  body: RequestBody<T>,
  options: { timeoutMs?: number } = {}
): Promise<BridgeResultMap[T]> {
  installNativeReceiver();
  const id = nextId();
  const type = (body as { type: T }).type;
  return new Promise<BridgeResultMap[T]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new NativeBridgeError('timeout', 'The app did not answer in time.'));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS[type]);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    const sent = postToNative({ ...body, id } as WebToNativeMessage);
    if (!sent) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new NativeBridgeError('no_bridge', 'Not running in the 3C app.'));
    }
  });
}

/** Fire-and-forget haptic tap; silently nothing on the web. */
export function nativeHaptic(style: HapticStyle): void {
  postToNative({ type: 'haptic', style });
}

/** Test-only: forget pending requests and listeners. */
export function __resetBridgeForTests(): void {
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  pending.clear();
  listeners.clear();
  installed = false;
  counter = 0;
}
