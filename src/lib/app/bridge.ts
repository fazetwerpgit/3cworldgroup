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
// (haptic, openExternal, statusBar, nativeSignOut, chatContext, ready, badge,
// widgetData) carry no id and get no reply.

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
/** The chat channel open on screen (null when none is). The shell keeps that channel's pushes out of the foreground banner. */
export interface ChatContextMessage {
  type: 'chatContext';
  channelId: string | null;
}

// Shell extras (fire-and-forget; the shell-side contract is the app repo's
// docs/NATIVE-EXTRAS.md). Senders live in ./shellExtras.
/** First meaningful paint: the shell may drop its splash. Sent once per page load. */
export interface ReadyMessage {
  type: 'ready';
}
/** App icon badge: total unread chat channels. 0 clears it. */
export interface BadgeMessage {
  type: 'badge';
  count: number;
}
/** The home-screen widget's numbers. Pay is an estimate only: never a pay date. */
export interface WidgetData {
  /** First 16 hex chars of SHA-256(uid); the shell clears the widget and badge when it changes. */
  uidHash: string;
  /** Expected pay MTD in whole dollars (negative when chargebacks net it below zero); null when not on a comp plan. */
  estPayMtd: number | null;
  /** Month the estimate covers, e.g. "October". */
  periodLabel: string;
  /** This week's leaderboard position (1 = top); null when not ranked. */
  rank: number | null;
  rankOf: number | null;
  /** Sales this month, counted as the dashboard counts them. */
  salesMtd: number | null;
  /** ISO 8601. */
  updatedAt: string;
}
export interface WidgetDataMessage {
  type: 'widgetData';
  /** null clears the widget (signed out). */
  data: WidgetData | null;
}

/** Status bar text colour: 'light' (white) over a dark page, 'dark' (black) over a light page. */
export type StatusBarStyle = 'light' | 'dark';
export interface StatusBarMessage {
  type: 'statusBar';
  style: StatusBarStyle;
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
export type BridgeEvent =
  | HapticMessage
  | OpenExternalMessage
  | StatusBarMessage
  | NativeSignOutMessage
  | ChatContextMessage
  | ReadyMessage
  | BadgeMessage
  | WidgetDataMessage;
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
  /**
   * ok once the shell's native Firebase Auth signed in with the custom token;
   * `uid` is the uid it is now signed in as (checked against the web user).
   */
  nativeAuth: { uid?: unknown } | undefined;
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
/** The portal is on screen (true) or behind the splash / lock / cover / in the background (false). */
export interface VisibleEvent {
  source: typeof NATIVE_SOURCE;
  type: 'visible';
  visible: boolean;
}
/** The app came back after 30+ minutes in the background (sent before visible:true). */
export interface ResumedEvent {
  source: typeof NATIVE_SOURCE;
  type: 'resumed';
  awayMs: number;
}
export type NoticeKind = 'progress' | 'success' | 'error' | 'dismiss';
export const NOTICE_KINDS: readonly NoticeKind[] = ['progress', 'success', 'error', 'dismiss'];
/** A short status toast from the shell (downloads). Same id replaces; 'dismiss' removes. */
export interface NoticeEvent {
  source: typeof NATIVE_SOURCE;
  type: 'notice';
  id: string;
  kind: NoticeKind;
  message: string;
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
/**
 * Unsolicited: the iOS keyboard is about to move. `height` is how much of the
 * WebView the keys will cover once the move ends (0 when hiding); `duration`
 * (ms) and `easing` are the system animation's, so the page can move with it.
 */
export interface NativeKeyboardEvent {
  source: typeof NATIVE_SOURCE;
  type: 'keyboard';
  height: number;
  duration: number;
  easing: KeyboardEasing;
}
export type KeyboardEasing = 'keyboard' | 'easeIn' | 'easeOut' | 'easeInEaseOut' | 'linear';
/** Unsolicited: open this portal URL (a tapped notification) without reloading the page. */
export interface NativeNavigateEvent {
  source: typeof NATIVE_SOURCE;
  type: 'navigate';
  url: string;
}
export type NativeToWebMessage =
  | ReplySuccess
  | ReplyFailure
  | PushTokenEvent
  | VisibleEvent
  | ResumedEvent
  | NoticeEvent
  | CapabilitiesEvent
  | NativeKeyboardEvent
  | NativeNavigateEvent;

/** Native -> web event types this page handles; the shell reads the list to decide whether to send one or fall back. */
export type BridgeFeature = 'navigate';

const ERROR_CODES: readonly NativeErrorCode[] = ['canceled', 'denied', 'not_configured', 'unsupported', 'failed'];
const KEYBOARD_EASINGS: readonly KeyboardEasing[] = ['keyboard', 'easeIn', 'easeOut', 'easeInEaseOut', 'linear'];
/** Longest keyboard animation the page will follow; anything longer is clamped. */
const MAX_KEYBOARD_DURATION_MS = 1000;

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
    __3C_BRIDGE__?: { version: number; receive: (message: unknown) => void; features: BridgeFeature[] };
    /** Set by shells that send `visible`: the latest value (false before the first). */
    __3C_VISIBLE__?: boolean;
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
  if (m.type === 'visible') {
    if (typeof m.visible !== 'boolean') return null;
    return { source: NATIVE_SOURCE, type: 'visible', visible: m.visible };
  }
  if (m.type === 'notice') {
    if (typeof m.id !== 'string' || !m.id || m.id.length > 200) return null;
    if (!NOTICE_KINDS.includes(m.kind as NoticeKind)) return null;
    const message = typeof m.message === 'string' ? m.message.slice(0, 300) : '';
    if (m.kind !== 'dismiss' && !message) return null;
    return { source: NATIVE_SOURCE, type: 'notice', id: m.id, kind: m.kind as NoticeKind, message };
  }
  if (m.type === 'resumed') {
    if (typeof m.awayMs !== 'number' || !Number.isFinite(m.awayMs) || m.awayMs < 0) return null;
    return { source: NATIVE_SOURCE, type: 'resumed', awayMs: m.awayMs };
  }
  if (m.type === 'capabilities') {
    const caps = parseCapabilities(m.capabilities);
    if (!caps) return null;
    return { source: NATIVE_SOURCE, type: 'capabilities', capabilities: caps };
  }
  if (m.type === 'keyboard') {
    if (typeof m.height !== 'number' || !Number.isFinite(m.height)) return null;
    const duration = typeof m.duration === 'number' && Number.isFinite(m.duration) ? m.duration : 0;
    return {
      source: NATIVE_SOURCE,
      type: 'keyboard',
      height: Math.max(0, Math.round(m.height)),
      duration: Math.min(MAX_KEYBOARD_DURATION_MS, Math.max(0, Math.round(duration))),
      easing: KEYBOARD_EASINGS.includes(m.easing as KeyboardEasing) ? (m.easing as KeyboardEasing) : 'keyboard',
    };
  }
  if (m.type === 'navigate') {
    if (typeof m.url !== 'string' || !m.url) return null;
    return { source: NATIVE_SOURCE, type: 'navigate', url: m.url };
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
  window.__3C_BRIDGE__ = { version: BRIDGE_VERSION, receive: receiveNativeMessage, features: [] };
}

/**
 * Announces that this page handles a native -> web event type until the
 * returned function runs. The shell checks window.__3C_BRIDGE__.features before
 * sending `navigate` (and falls back to a full load without it).
 */
export function advertiseBridgeFeature(feature: BridgeFeature): () => void {
  installNativeReceiver();
  const bridge = typeof window !== 'undefined' ? window.__3C_BRIDGE__ : undefined;
  if (!bridge) return () => {};
  bridge.features.push(feature);
  return () => {
    const index = bridge.features.indexOf(feature);
    if (index >= 0) bridge.features.splice(index, 1);
  };
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

/** Tells the shell which chat channel is on screen (null: none); silently nothing on the web. */
export function reportChatContext(channelId: string | null): void {
  postToNative({ type: 'chatContext', channelId });
}

/** Test-only: forget pending requests and listeners. */
export function __resetBridgeForTests(): void {
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  pending.clear();
  listeners.clear();
  installed = false;
  counter = 0;
}
