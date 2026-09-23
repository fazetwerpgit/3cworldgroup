'use client';

import type { CSSProperties } from 'react';
import { Lock, RotateCw, ShieldAlert, WifiOff } from 'lucide-react';
import { useFirstReveal } from '@/hooks/useFirstReveal';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';
import s from '@/components/portal/rep/rep.module.css';
import c from './chat.module.css';

/** "9:14 AM" today, "Yesterday", a weekday inside the week, else "Sep 3". */
export function formatChannelTime(date: Date | null | undefined): string {
  if (!date) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfToday - startOfThat) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ChannelRowsProps {
  channels: ChatChannelDoc[];
  loading: boolean;
  /** The channel listener failed: say so, never show an empty list as if it were real. */
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  /** Desktop rail only: the open channel gets the current-row treatment. */
  activeChannelId?: string;
  onSelect: (channelId: string) => void;
  /** Resubscribe after a listener failure (falls back to a reload). */
  onRetry?: () => void;
}

/** Channel rows shared by the phone channel screen and the desktop rail. */
export function ChannelRows({
  channels,
  loading,
  error,
  unreadByChannel,
  activeChannelId,
  onSelect,
  onRetry = () => window.location.reload(),
}: ChannelRowsProps) {
  const reveal = useFirstReveal('3c:reveal:chat-channels', !loading && channels.length > 0);
  if (loading) {
    return (
      <div aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div className={c.channelSkel} key={row}>
            <span className={s.skel} style={{ width: 40, height: 40, borderRadius: 6 }} />
            <span>
              <span className={s.skel} style={{ width: '46%', height: 14 }} />
              <span className={s.skel} style={{ width: '78%', height: 12 }} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (error && channels.length === 0) {
    return (
      <div className={s.failed} role="alert">
        Couldn&apos;t load channels
        <button type="button" className={s.retry} onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }
  if (channels.length === 0) {
    return <p className={c.empty}>No channels yet. An admin can sync them from Chat channels.</p>;
  }
  return (
    <>
      {error ? (
        // The listener died after channels loaded: the list is stale (no new
        // unread dots or times), so say so without taking it away.
        <p className={c.listOffline} role="status">
          <WifiOff size={16} aria-hidden="true" />
          <span>Chat&apos;s offline</span>
          <button type="button" onClick={onRetry} className={c.listOfflineRetry}>
            <RotateCw size={14} aria-hidden="true" /> Retry
          </button>
        </p>
      ) : null}
      <ul className={c.channels} data-reveal={reveal || undefined}>
        {channels.map((channel, index) => {
          const unread = !!unreadByChannel?.[channel.id];
          return (
            <li key={channel.id} style={{ '--i': index } as CSSProperties}>
              <button
                type="button"
                onClick={() => onSelect(channel.id)}
                aria-current={activeChannelId === channel.id ? 'true' : undefined}
                className={`${c.channel} ${unread ? c.channelUnread : ''}`}
              >
                <span className={c.channelCopy}>
                  <span className={c.channelName}>
                    {channel.name}
                    {channel.audience === 'managers' ? <Lock size={12} role="img" aria-label="Private" /> : null}
                  </span>
                  {channel.description ? <span className={c.channelDesc}>{channel.description}</span> : null}
                </span>
                <span className={c.channelMeta}>
                  {formatChannelTime(channel.lastMessageAt)}
                  {unread ? (
                    <>
                      <i className={c.unreadDot} aria-hidden="true" />
                      <span className={s.srOnly}>Unread messages</span>
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The phone's first chat screen: an ordinary page above the tab bar. */
export function MobileChannelList({
  channels,
  loading,
  error,
  unreadByChannel,
  onOpenChannel,
  onRetry,
}: {
  channels: ChatChannelDoc[];
  loading: boolean;
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  onOpenChannel: (channelId: string) => void;
  onRetry?: () => void;
}) {
  const unreadCount = channels.filter((channel) => unreadByChannel?.[channel.id]).length;
  return (
    <section className={c.listScreen} aria-labelledby="chat-title">
      <div className={c.listHead}>
        <h1 id="chat-title" className={c.title}>
          Team chat
        </h1>
        {unreadCount > 0 ? <span className={c.listCount}>{unreadCount} unread</span> : null}
      </div>
      <div className={`${s.panel} ${c.listPanel}`}>
        <ChannelRows
          channels={channels}
          loading={loading}
          error={error}
          unreadByChannel={unreadByChannel}
          onSelect={onOpenChannel}
          onRetry={onRetry}
        />
      </div>
      <p className={c.guide}>
        <ShieldAlert size={16} aria-hidden="true" />
        Keep customer details out of chat. Never post card numbers or SSNs.
      </p>
    </section>
  );
}
