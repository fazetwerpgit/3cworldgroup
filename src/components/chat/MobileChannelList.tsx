'use client';

import { Lock } from 'lucide-react';
import { ChatChannel } from '@/types';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-rep-b.css';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'ALL',
  field: 'FIELD',
  managers: 'MGRS',
  platform: 'ADMIN',
};

interface MobileChannelListProps {
  channels: ChatChannel[];
  loading: boolean;
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  onOpenChannel: (channelId: string) => void;
}

export function MobileChannelList({
  channels,
  loading,
  error,
  unreadByChannel,
  onOpenChannel,
}: MobileChannelListProps) {
  return (
    <section className="chat-line-mobile-channel-screen">
      <PageTitle title="Team Chat" />

      {error && <p className="chat-line-mobile-error" role="alert">{error}</p>}

      {loading ? (
        <div className="chat-line-mobile-channel-list" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => <div className="chat-line-mobile-channel-skeleton" key={row}><span /><span /><span /></div>)}
        </div>
      ) : channels.length === 0 ? (
        <p className="chat-line-mobile-empty">No live channels yet. Ask an admin to sync chat channels.</p>
      ) : (
        <div className="chat-line-mobile-channel-list">
          {channels.map((channel, index) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => onOpenChannel(channel.id)}
              className={`chat-line-mobile-channel ${index === 0 ? 'is-active' : ''}`}
            >
              <span className="chat-line-mobile-number" aria-hidden="true">#</span>
              <span className="chat-line-mobile-tick" />
              <span className="chat-line-mobile-copy">
                <strong>{channel.name}{channel.audience === 'managers' && <Lock aria-hidden="true" />}</strong>
                <small>{channel.description}</small>
              </span>
              <span className="chat-line-mobile-audience">{audienceCopy[channel.audience]}{unreadByChannel?.[channel.id] && <i aria-label="Unread messages" />}</span>
            </button>
          ))}
        </div>
      )}

      <p className="chat-line-mobile-pii">Don&apos;t post customer card numbers or SSNs here.</p>
    </section>
  );
}
