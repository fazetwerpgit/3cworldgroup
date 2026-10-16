'use client';

import { Suspense, createRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Hash, Pin, SmilePlus, Users } from 'lucide-react';
import { ChannelRows, MobileChannelList } from '@/components/chat/MobileChannelList';
import { MobileThread, type ThreadMessage } from '@/components/chat/MobileThread';
import { ChannelInfoSheet } from '@/components/chat/ChannelInfoSheet';
import { ChatAvatar } from '@/components/chat/ChatAvatar';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';
import s from '@/components/portal/rep/rep.module.css';
import c from '@/components/chat/chat.module.css';

// Dev-only harness for the taste pass Package P3 (Chat). No auth, no network.
// ?view=list|thread|info|desk.

const now = Date.now();
const CHANNELS: ChatChannelDoc[] = [
  { id: 'all', name: 'All Company', description: 'Wins, news and the Friday call', audience: 'all', order: 0, active: true, lastMessageAt: new Date(now - 4 * 60_000) },
  { id: 'field', name: 'Field team', description: 'Door notes, territory swaps, rides', audience: 'field', order: 1, active: true, lastMessageAt: new Date(now - 2 * 3600_000) },
  { id: 'mgr', name: 'Managers', description: 'Scheduling and coaching', audience: 'managers', order: 2, active: true, lastMessageAt: new Date(now - 26 * 3600_000) },
  { id: 'ops', name: 'Admin and ops', description: 'Install dates and paperwork', audience: 'platform', order: 3, active: true, lastMessageAt: new Date(now - 4 * 86_400_000) },
];
const UNREAD = { all: true, field: true };

function msg(id: string, minsAgo: number, author: string, text: string, extra: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id,
    channelId: 'all',
    text,
    authorId: author === 'You' ? 'me' : author,
    authorName: author === 'You' ? 'Jacob Myers' : author,
    createdAt: new Date(now - minsAgo * 60_000),
    reactionCounts: {},
    myReactions: [],
    ...extra,
  };
}

const MESSAGES: ThreadMessage[] = [
  msg('m1', 1500, 'Dana Alvarez', 'Morning team. Friday call moves to 10 AM this week.'),
  msg('m2', 1490, 'Cole Brandt', 'Got it, I will be on.', { reactionCounts: { '👍': 3 }, myReactions: ['👍'] }), // taste-skill-ignore: sample reaction data
  msg('m3', 60, 'Braeden Hall', 'Closed two on Maple Ridge this morning, both 1 Gig.', { reactionCounts: { '🔥': 4, '🎉': 2 }, myReactions: ['🔥'] }), // taste-skill-ignore: sample reaction data
  msg('m4', 58, 'Braeden Hall', 'The HOA lady was out again, worth a pass after 5.'),
  msg('m5', 40, 'You', 'Nice work. I will take the north loop tomorrow.', {
    replyTo: { messageId: 'm4', authorName: 'Braeden Hall', text: 'The HOA lady was out again, worth a pass after 5.' },
  }),
  msg('m6', 30, 'You', 'Proof of install for the Okafor account.', {
    attachment: { type: 'file', url: '#', name: 'okafor-install-proof.pdf', size: 214_000, contentType: 'application/pdf', previewUrl: '/logo.webp', previewWidth: 550, previewHeight: 516 },
  }),
  msg('m7', 20, 'Dana Alvarez', 'Rate card for October.', {
    attachment: { type: 'file', url: '#', name: 'october-rate-card.pdf', size: 88_000, contentType: 'application/pdf' },
  }),
  msg('m8', 4, 'You', 'Heading out now, text me if a door needs a second visit.', { pendingState: 'failed' }),
];

const MEMBERS = [
  { uid: 'a', name: 'Dana Alvarez', role: 'manager' },
  { uid: 'b', name: 'Braeden Hall', role: 'rep' },
  { uid: 'c', name: 'Cole Brandt', role: 'rep', isExtra: true },
];

const fakeFetch = async (url: string) => {
  const body = url.endsWith('/members') ? { members: MEMBERS, addable: [] } : url.includes('/media') ? { media: [] } : { pins: [] };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const noop = () => {};

function Thread() {
  const [draft, setDraft] = useState('');
  return (
    <div className={c.app}>
      <div className={c.phone}>
        <MobileThread
          pinnedMessage={MESSAGES[0]}
          channel={CHANNELS[0]}
          memberCount={42}
          channelId="all"
          messages={MESSAGES}
          snapshotVersion={1}
          windowSize={75}
          lastSnapshotWindow={75}
          hasMore={false}
          onLoadOlder={noop}
          companyStats={{ mtdCount: 42, mtdMonthlyValue: 0, topRep: { repName: 'Braeden Hall', count: 9 }, lastSale: { repName: 'Cole Brandt', at: new Date(now - 12 * 60_000).toISOString() } }}
          authorAvatars={{}}
          loading={false}
          renderedChannel="all"
          currentUserId="me"
          canModerate={false}
          canPin
          draft={draft}
          gifEnabled
          authedFetch={fakeFetch}
          messagesEndRef={createRef<HTMLDivElement>()}
          scrollToBottomSignal={0}
          formatTime={(d) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')}
          replyTarget={null}
          editTarget={null}
          replySnippet={() => ({ messageId: '', authorName: '', text: '' })}
          onBack={noop}
          onOpenInfo={noop}
          onDraftChange={setDraft}
          onSend={noop}
          onSendImage={noop}
          onSendGif={noop}
          onOpenImage={noop}
          onError={noop}
          onDelete={noop}
          onReactionError={noop}
          onRetryPending={noop}
          onDiscardPending={noop}
          onSendTextOnly={noop}
          connectionNotice={null}
          onReply={noop}
          onEdit={noop}
          onCopy={noop}
          onTogglePin={noop}
          onCancelReply={noop}
          onCancelEdit={noop}
          onSaveEdit={noop}
        />
      </div>
    </div>
  );
}

function Desk() {
  const [active, setActive] = useState('all');
  return (
    <div className={c.app}>
      <div className={c.desk} style={{ display: 'grid' }}>
        <aside className={`${s.panel} ${c.rail}`} aria-label="Channels">
          <div className={c.panelHead}>
            <h1 className={c.railTitle}>Team chat</h1>
          </div>
          <div className={c.railList}>
            <ChannelRows channels={CHANNELS} loading={false} unreadByChannel={UNREAD} activeChannelId={active} onSelect={setActive} />
          </div>
          <div className={c.railFoot}>
            <p className={c.guide}>Keep customer details out of chat. Never post card numbers or SSNs.</p>
          </div>
        </aside>
        <section className={`${s.panel} ${c.convo}`}>
          <header className={c.convoHead}>
            <button type="button" className={c.titleBtn}>
              <span className={c.convoTitle}>
                <Hash size={18} aria-hidden="true" /> All Company
              </span>
              <span className={c.convoDesc}>Wins, news and the Friday call</span>
            </button>
            <button type="button" className={c.membersBtn}>
              <Users size={16} aria-hidden="true" /> 42
            </button>
          </header>
          <div className={c.pinned}>
            <Pin size={16} aria-hidden="true" />
            <span className={c.pinnedText}>Morning team. Friday call moves to 10 AM this week.</span>
            <span className={c.pinnedBy}>Dana Alvarez</span>
          </div>
          <div className={c.stage}>
            <div className={c.scroller}>
              <div className={c.day}>Yesterday</div>
              {MESSAGES.slice(0, 5).map((m) => (
                <div key={m.id} className={c.row}>
                  <div className={c.rowAvatar}>
                    <ChatAvatar authorId={m.authorId} authorName={m.authorName} />
                  </div>
                  <div className={c.rowBody}>
                    <div className={c.rowTop}>
                      <span className={c.author}>{m.authorName}</span>
                      <span className={c.time}>9:41 AM</span>
                    </div>
                    {m.replyTo && (
                      <div className={c.quote}>
                        <strong>{m.replyTo.authorName}</strong>
                        <span>{m.replyTo.text}</span>
                      </div>
                    )}
                    <p className={c.text}>{m.text}</p>
                    {Object.keys(m.reactionCounts).length > 0 && (
                      <div className={c.reactions}>
                        {Object.entries(m.reactionCounts).map(([e, n]) => (
                          <button key={e} type="button" className={`${c.reaction} ${m.myReactions.includes(e) ? c.reactionMine : ''}`}>
                            <span>{e}</span>
                            <span>{n}</span>
                          </button>
                        ))}
                        <button type="button" className={c.addReaction} aria-label="Add reaction">
                          <SmilePlus size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={c.composer}>
            <div className={c.composeRow}>
              <button type="button" className={c.tool}>GIF</button>
              <textarea className={c.input} rows={1} placeholder="Message All Company" />
              <button type="button" className={c.send} disabled>
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Body() {
  const view = useSearchParams().get('view') ?? 'list';
  return (
    <div className={s.root} data-shell="rep" style={{ minHeight: '100dvh' }}>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          {view === 'thread' ? (
            <Thread />
          ) : view === 'desk' ? (
            <Desk />
          ) : (
            <div className={c.app}>
              <MobileChannelList channels={CHANNELS} loading={false} unreadByChannel={UNREAD} onOpenChannel={noop} />
              {view === 'info' && (
                <ChannelInfoSheet channel={CHANNELS[0]} open onOpenChange={noop} isAdmin authedFetch={fakeFetch} onOpenImage={noop} lightboxOpen={false} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Body />
    </Suspense>
  );
}
