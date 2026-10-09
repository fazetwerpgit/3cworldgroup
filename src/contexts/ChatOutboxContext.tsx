'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { prepareImageForUpload, uploadChatImageWithProgress } from '@/components/chat/attachmentUpload';
import type { ThreadMessage } from '@/components/chat/MobileThread';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import {
  SendRequestError,
  autoRetryExpired,
  classifySendError,
  decideAfterFailure,
  outboxKey,
  parseOutbox,
  reconcileEchoes,
  toOutboxEntries,
} from '@/lib/chat/outbox';
import { loadPendingPhoto, prunePendingPhotos, savePendingPhoto } from '@/lib/chat/pendingPhotos';
import type { ChatAttachment } from '@/types';

// The chat outbox, owned by the portal shell rather than the Chat page: queued
// messages (and photos mid-upload) keep sending while the rep is on any portal
// page, and this is the ONLY place that sends them — the Chat page renders the
// echoes and hands new ones in. Sends are idempotent by clientMessageId.

// A message POST on bad signal can hang for a minute before the browser gives
// up; abort sooner and let the retry policy take over (the send is idempotent,
// so an abort after the server stored it can't duplicate it).
const SEND_TIMEOUT_MS = 20_000;

const PHOTO_LOST_ERROR = 'That photo is no longer on this phone. Discard it and pick it again.';

// Runs one network step of a send; its rejection (fetch failing, a timeout
// abort, the ID-token refresh failing offline) becomes a retryable network
// failure. Everything else thrown on the send path stays permanent.
async function networkStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof SendRequestError) throw error;
    throw new SendRequestError('Message not sent. Check your connection.', { kind: 'network' });
  }
}

async function authedFetch(url: string, init?: RequestInit) {
  const token = await auth?.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
  });
}

interface ChatOutboxValue {
  // Every undelivered (or delivered but not yet reconciled) echo, all channels.
  echoes: ThreadMessage[];
  send: (echo: ThreadMessage) => void;
  retry: (echo: ThreadMessage) => void;
  // A lost photo's caption goes out on its own.
  sendTextOnly: (echo: ThreadMessage) => void;
  discard: (echoId: string) => void;
  // Drops echoes the open thread's realtime feed has delivered.
  reconcile: (deliveredIds: ReadonlySet<string>, channelId: string, windowFloorMs: number | null) => void;
  // Send errors as they happen ('' when a send starts); the Chat page shows them.
  subscribeErrors: (listener: (message: string) => void) => () => void;
}

const ChatOutboxContext = createContext<ChatOutboxValue | null>(null);

export function useChatOutbox(): ChatOutboxValue {
  const value = useContext(ChatOutboxContext);
  if (!value) throw new Error('useChatOutbox must be used within a ChatOutboxProvider');
  return value;
}

export function ChatOutboxProvider({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  // Only chat users have a queue; everyone else skips the storage work.
  const uid = user && hasPermission('chat:read') ? user.uid : null;
  const [echoes, setEchoes] = useState<ThreadMessage[]>([]);

  // Live mirror of echoes for retry timers and lifecycle listeners, which must
  // act on the latest echo (cached upload, attempt count) rather than the copy
  // captured when they were scheduled.
  const echoesRef = useRef<ThreadMessage[]>([]);
  useEffect(() => {
    echoesRef.current = echoes;
  }, [echoes]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  const uidRef = useRef(uid);
  const errorListenersRef = useRef<Set<(message: string) => void>>(new Set());

  const emitError = useCallback((message: string) => {
    for (const listener of errorListenersRef.current) listener(message);
  }, []);
  const subscribeErrors = useCallback((listener: (message: string) => void) => {
    errorListenersRef.current.add(listener);
    return () => {
      errorListenersRef.current.delete(listener);
    };
  }, []);

  const clearRetryTimer = useCallback((echoId: string) => {
    const timer = retryTimersRef.current.get(echoId);
    if (timer !== undefined) window.clearTimeout(timer);
    retryTimersRef.current.delete(echoId);
  }, []);
  const clearAllRetryTimers = useCallback(() => {
    for (const timer of retryTimersRef.current.values()) window.clearTimeout(timer);
    retryTimersRef.current.clear();
  }, []);
  useEffect(() => clearAllRetryTimers, [clearAllRetryTimers]);

  const updateEcho = useCallback((echoId: string, patch: Partial<ThreadMessage>) => {
    setEchoes((prev) => prev.map((p) => (p.id === echoId ? { ...p, ...patch } : p)));
  }, []);
  const postMessageRef = useRef<(echo: ThreadMessage) => Promise<void>>(async () => undefined);

  // A restored photo's file comes back from IndexedDB (with a fresh preview),
  // once per echo however many callers ask (restore and an early flush can race).
  // Null when it is gone: the echo is then marked photoLost and fails.
  const photoLoadsRef = useRef<Map<string, Promise<File | null>>>(new Map());
  const reloadPhoto = useCallback(
    (echoId: string): Promise<File | null> => {
      const pending = photoLoadsRef.current.get(echoId);
      if (pending) return pending;
      const load = loadPendingPhoto(echoId).then((file) => {
        photoLoadsRef.current.delete(echoId);
        // Discarded (or the account changed) meanwhile: no preview to make.
        if (!echoesRef.current.some((p) => p.id === echoId)) return file;
        const patch: Partial<ThreadMessage> = file
          ? { pendingFile: file, photoPending: false, localPreviewUrl: URL.createObjectURL(file) }
          : { pendingState: 'failed', photoLost: true, uploadProgress: undefined };
        updateEcho(echoId, patch);
        echoesRef.current = echoesRef.current.map((p) => (p.id === echoId ? { ...p, ...patch } : p));
        return file;
      });
      photoLoadsRef.current.set(echoId, load);
      return load;
    },
    [updateEcho]
  );

  // POSTs an echo. The echo stays "Sending…" through transient failures: it is
  // retried with backoff while online, or as soon as the connection returns
  // (see flushOutbox), and only a permanent error or an exhausted/stale retry
  // run marks it 'failed' ("Not sent · Tap to retry"). The POST carries the
  // echo's clientMessageId, so no retry can post twice. On success the echo
  // stays put until the realtime feed delivers the real message and
  // reconciliation drops it — no flicker. An image echo first prepares its
  // photo once (cached so a retry never re-reads the picked file) and uploads
  // it with progress (cached so a message-POST retry won't re-upload); a GIF
  // echo already carries its attachment.
  const postMessage = useCallback(
    async (echo: ThreadMessage) => {
      if (inFlightRef.current.has(echo.id)) return;
      inFlightRef.current.add(echo.id);
      clearRetryTimer(echo.id);
      const owner = uidRef.current;
      const attempts = (echo.sendAttempts ?? 0) + 1;
      emitError('');
      try {
        let attachment: ChatAttachment | undefined =
          echo.uploadedAttachment ?? (echo.attachment?.type === 'gif' ? echo.attachment : undefined);
        let pendingFile = echo.pendingFile;
        if (!attachment && !pendingFile && echo.photoPending) {
          pendingFile = (await reloadPhoto(echo.id)) ?? undefined;
          if (!pendingFile) throw new Error(PHOTO_LOST_ERROR);
        }
        // Signed out or switched account meanwhile: never post as someone else.
        if (auth?.currentUser?.uid !== echo.authorId) return;
        if (pendingFile && !attachment) {
          let prepared = echo.preparedUpload;
          if (!prepared) {
            prepared = await prepareImageForUpload(pendingFile);
            const ready = prepared;
            // Publish prepared dimensions before the (slower) upload so the pending
            // tile reserves its box immediately and its decode causes no shift.
            updateEcho(echo.id, {
              preparedUpload: ready,
              ...(ready.width && ready.height ? { localPreviewWidth: ready.width, localPreviewHeight: ready.height } : {}),
            });
          }
          const idToken = await networkStep(async () => (await auth?.currentUser?.getIdToken()) ?? '');
          let shownStep = -1;
          attachment = await uploadChatImageWithProgress(
            idToken,
            echo.channelId,
            prepared.file,
            prepared.width,
            prepared.height,
            (fraction) => {
              // Every progress update re-renders the thread: step in 5% increments.
              const step = Math.floor(fraction * 20);
              if (step === shownStep) return;
              shownStep = step;
              updateEcho(echo.id, { uploadProgress: fraction });
            }
          );
          updateEcho(echo.id, { uploadedAttachment: attachment, uploadProgress: 1 });
        }
        if (auth?.currentUser?.uid !== echo.authorId || uidRef.current !== owner) return;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
        let response: Response;
        try {
          response = await networkStep(() =>
            authedFetch('/api/portal/chat/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                channelId: echo.channelId,
                text: echo.text,
                ...(echo.clientMessageId ? { clientMessageId: echo.clientMessageId } : {}),
                ...(attachment ? { attachment } : {}),
                // Reply rides the same send path; the server re-stamps the snippet.
                ...(echo.replyToMessageId ? { replyToMessageId: echo.replyToMessageId } : {}),
              }),
            })
          );
        } finally {
          window.clearTimeout(timeout);
        }
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new SendRequestError(json.error || 'Failed to send message', { kind: 'http', status: response.status });
        }
        if (json.duplicate === true) {
          // Stored by an earlier attempt whose response was lost: the message is
          // already in the feed (possibly older than the loaded window, where
          // reconciliation can't see it), so the echo is done.
          setEchoes((prev) => prev.filter((p) => p.id !== echo.id));
          return;
        }
        updateEcho(echo.id, {
          deliveredId: typeof json.messageId === 'string' ? json.messageId : echo.id,
          sendAttempts: 0,
        });
      } catch (err) {
        const failure = classifySendError(err);
        const windowStart = echo.retryWindowStart ?? echo.createdAt?.getTime() ?? Date.now();
        const decision = failure
          ? decideAfterFailure({
              failure,
              attempts,
              ageMs: Date.now() - windowStart,
              online: navigator.onLine !== false,
            })
          : ({ action: 'fail' } as const);
        if (decision.action === 'fail') {
          emitError(err instanceof Error && err.name !== 'AbortError' ? err.message : 'Failed to send message');
          updateEcho(echo.id, { pendingState: 'failed', sendAttempts: 0, uploadProgress: undefined });
        } else {
          // Still "Sending…": retried on a timer, or by flushOutbox when the
          // connection comes back. Waiting on 'online' doesn't use up an attempt.
          updateEcho(echo.id, {
            sendAttempts: decision.action === 'retry' ? attempts : attempts - 1,
            uploadProgress: undefined,
          });
          // Signed out (or switched account) meanwhile: no retry for the old queue.
          if (decision.action === 'retry' && uidRef.current === owner) {
            const timer = window.setTimeout(() => {
              retryTimersRef.current.delete(echo.id);
              const latest = echoesRef.current.find((p) => p.id === echo.id);
              if (latest?.pendingState === 'sending' && !latest.deliveredId) void postMessageRef.current(latest);
            }, decision.delayMs);
            retryTimersRef.current.set(echo.id, timer);
          }
        }
      } finally {
        inFlightRef.current.delete(echo.id);
      }
    },
    [clearRetryTimer, emitError, reloadPhoto, updateEcho]
  );
  useEffect(() => {
    postMessageRef.current = postMessage;
  }, [postMessage]);

  // Sends every queued echo now (skipping ones in flight or already delivered)
  // instead of waiting out a backoff timer: on 'online', when the app returns
  // to the foreground, and after the outbox is restored on load.
  const flushOutbox = useCallback(() => {
    if (navigator.onLine === false) return;
    const now = Date.now();
    for (const echo of echoesRef.current) {
      if (echo.pendingState !== 'sending' || echo.deliveredId || inFlightRef.current.has(echo.id)) continue;
      // Waited for the connection past the auto-retry window: the user decides.
      const windowStart = echo.retryWindowStart ?? echo.createdAt?.getTime() ?? now;
      if (autoRetryExpired(windowStart, now)) {
        clearRetryTimer(echo.id);
        updateEcho(echo.id, { pendingState: 'failed', sendAttempts: 0, uploadProgress: undefined });
        continue;
      }
      void postMessageRef.current(echo);
    }
  }, [clearRetryTimer, updateEcho]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushOutbox();
    };
    window.addEventListener('online', flushOutbox);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flushOutbox);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flushOutbox]);

  // Outbox persistence: unsent echoes survive a reload or the app being killed.
  // Restored once per signed-in user (during render, so restored echoes are in
  // the very first thread paint); rows past the auto-retry age come back as
  // "Not sent", the rest resume sending. A photo that had not finished
  // uploading comes back from IndexedDB, or reads "Photo not sent" without it.
  const [outboxUid, setOutboxUid] = useState<string | null>(null);
  if (uid !== outboxUid) {
    setOutboxUid(uid);
    let restored: ThreadMessage[] = [];
    if (uid) {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(outboxKey(uid));
      } catch {
        // Storage blocked (private mode): nothing to restore.
      }
      restored = parseOutbox(raw, uid, Date.now()).map((entry) => ({
        id: entry.id,
        clientMessageId: entry.clientMessageId,
        channelId: entry.channelId,
        text: entry.text,
        authorId: entry.authorId,
        authorName: entry.authorName,
        authorRole: entry.authorRole,
        createdAt: new Date(entry.createdAt),
        reactionCounts: {},
        myReactions: [],
        attachment: entry.attachment,
        uploadedAttachment: entry.attachment?.type === 'image' ? entry.attachment : undefined,
        replyTo: entry.replyTo,
        replyToMessageId: entry.replyToMessageId,
        ...(entry.photoPending ? { photoPending: true } : {}),
        pendingState: entry.failed ? 'failed' : 'sending',
      }));
    }
    // A different account (or none) never inherits the previous queue.
    setEchoes(restored);
  }
  useEffect(() => {
    uidRef.current = outboxUid;
    inFlightRef.current = new Set();
    clearAllRetryTimers();
    if (!outboxUid) return;
    let active = true;
    // Bring back restored photos' files (and previews) first, then send.
    const photos = echoesRef.current.filter((echo) => echo.photoPending && !echo.pendingFile);
    void Promise.all(photos.map((echo) => reloadPhoto(echo.id))).then(() => {
      if (active) flushOutbox();
    });
    return () => {
      active = false;
    };
  }, [outboxUid, clearAllRetryTimers, flushOutbox, reloadPhoto]);
  useEffect(() => {
    if (!outboxUid || outboxUid !== uid) return;
    const entries = toOutboxEntries(echoes);
    try {
      if (entries.length > 0) window.localStorage.setItem(outboxKey(outboxUid), JSON.stringify(entries));
      else window.localStorage.removeItem(outboxKey(outboxUid));
    } catch {
      // Storage full or blocked: the queue still works for this session.
    }
  }, [echoes, outboxUid, uid]);
  // Stored photo files no queued message needs any more are released.
  const photoIdsKey = echoes
    .filter((echo) => (echo.pendingFile || echo.photoPending) && !echo.uploadedAttachment && !echo.deliveredId)
    .map((echo) => echo.id)
    .join(',');
  useEffect(() => {
    if (!outboxUid) return;
    void prunePendingPhotos(outboxUid, new Set(photoIdsKey ? photoIdsKey.split(',') : []));
  }, [outboxUid, photoIdsKey]);

  // Revoke object URLs for image echoes once they're gone (delivered and
  // reconciled, or discarded) so uploading previews don't leak.
  const trackedPreviewUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const live = new Set(echoes.map((echo) => echo.localPreviewUrl).filter((url): url is string => !!url));
    for (const url of trackedPreviewUrls.current) {
      if (!live.has(url)) {
        URL.revokeObjectURL(url);
        trackedPreviewUrls.current.delete(url);
      }
    }
    for (const url of live) trackedPreviewUrls.current.add(url);
  }, [echoes]);
  useEffect(() => {
    const tracked = trackedPreviewUrls.current;
    return () => {
      for (const url of tracked) URL.revokeObjectURL(url);
    };
  }, []);

  const send = useCallback(
    (echo: ThreadMessage) => {
      setEchoes((prev) => [...prev, echo]);
      echoesRef.current = [...echoesRef.current, echo];
      if (echo.pendingFile) void savePendingPhoto(echo.id, echo.pendingFile);
      void postMessage(echo);
    },
    [postMessage]
  );

  // A tap on "Not sent" starts a fresh auto-retry run from now.
  const retry = useCallback(
    (echo: ThreadMessage) => {
      const restart = { pendingState: 'sending' as const, sendAttempts: 0, retryWindowStart: Date.now() };
      updateEcho(echo.id, restart);
      const latest = echoesRef.current.find((p) => p.id === echo.id) ?? echo;
      void postMessage({ ...latest, ...restart });
    },
    [postMessage, updateEcho]
  );

  const sendTextOnly = useCallback(
    (echo: ThreadMessage) => {
      if (!echo.text) return;
      const textOnly = { photoPending: false, photoLost: false, pendingFile: undefined, localPreviewUrl: undefined };
      updateEcho(echo.id, textOnly);
      echoesRef.current = echoesRef.current.map((p) => (p.id === echo.id ? { ...p, ...textOnly } : p));
      retry(echo);
    },
    [retry, updateEcho]
  );

  const discard = useCallback(
    (echoId: string) => {
      clearRetryTimer(echoId);
      setEchoes((prev) => prev.filter((p) => p.id !== echoId));
    },
    [clearRetryTimer]
  );

  const reconcile = useCallback(
    (deliveredIds: ReadonlySet<string>, channelId: string, windowFloorMs: number | null) => {
      setEchoes((prev) => {
        if (prev.length === 0) return prev;
        const { reconciledIds } = reconcileEchoes(deliveredIds, prev, channelId, windowFloorMs);
        if (reconciledIds.length === 0) return prev;
        const done = new Set(reconciledIds);
        return prev.filter((echo) => !done.has(echo.id));
      });
    },
    []
  );

  const value = useMemo(
    () => ({ echoes, send, retry, sendTextOnly, discard, reconcile, subscribeErrors }),
    [echoes, send, retry, sendTextOnly, discard, reconcile, subscribeErrors]
  );
  return <ChatOutboxContext.Provider value={value}>{children}</ChatOutboxContext.Provider>;
}
