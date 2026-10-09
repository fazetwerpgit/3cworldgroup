'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import { MemberAvatarChip } from './ChannelInfoSheet';
import c from './chat.module.css';

/** One row of GET /api/portal/chat/channels/[channelId]/reads. */
export interface ChatReader {
  uid: string;
  name: string;
  avatarUrl?: string;
  readAt: string;
}

/** The message whose readers are being shown. */
export interface ReadByTarget {
  channelId: string;
  messageId: string;
}

type ReadByState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; readers: ChatReader[] };

/**
 * "Read by" for one message, on the D sheet (bottom sheet on phones, centred
 * dialog on desktop), portaled to <body> through BodyLayer. Fetches the list
 * each time it opens; nothing is cached, so it is always current.
 */
export function ReadBySheet({
  target,
  authedFetch,
  onClose,
}: {
  target: ReadByTarget | null;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  if (!target) return null;
  // Keyed per message so every opening starts from a fresh loading state.
  return (
    <ReadByBody
      key={`${target.channelId}/${target.messageId}`}
      target={target}
      authedFetch={authedFetch}
      onClose={onClose}
    />
  );
}

function ReadByBody({
  target,
  authedFetch,
  onClose,
}: {
  target: ReadByTarget;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}) {
  const [state, setState] = useState<ReadByState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const url = `/api/portal/chat/channels/${encodeURIComponent(target.channelId)}/reads?messageId=${encodeURIComponent(target.messageId)}`;
    authedFetch(url)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('reads fetch failed'))))
      .then((json: { readers?: ChatReader[] }) => {
        if (!cancelled) setState({ status: 'ready', readers: Array.isArray(json.readers) ? json.readers : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [authedFetch, target.channelId, target.messageId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const count = state.status === 'ready' ? state.readers.length : 0;

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="chat-read-by-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="chat-read-by-title" className={s.sheetTitle}>
              Read by
            </h2>
            <button type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={`${s.sheetBody} ${c.infoBody}`}>
            {state.status === 'loading' ? (
              <p className={c.empty} role="status">
                Loading…
              </p>
            ) : state.status === 'error' ? (
              <p className={c.empty} role="alert">
                Couldn&apos;t load who read this. Try again in a moment.
              </p>
            ) : count === 0 ? (
              <p className={c.empty}>No one yet</p>
            ) : (
              <>
                <p className={c.infoLabel}>
                  {count} {count === 1 ? 'person' : 'people'}
                </p>
                <ul className={c.people}>
                  {state.readers.map((reader) => (
                    <li key={reader.uid}>
                      <div className={c.person}>
                        <MemberAvatarChip name={reader.name} avatarUrl={reader.avatarUrl} />
                        <span className={c.personName}>{reader.name}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
