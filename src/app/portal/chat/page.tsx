'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Lock, MessageSquareText, RefreshCcw, Send, Trash2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { ChatChannel } from '@/types';

interface ChatMessageView {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: string | null;
}

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

export default function TeamChatPage() {
  const { user, hasPermission } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId),
    [activeChannelId, channels]
  );
  const canModerate = hasPermission('chat:moderate');

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    setLoadingChannels(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/chat/channels?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load channels');
      setChannels(json.channels);
      setActiveChannelId((current) => current || json.channels?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoadingChannels(false);
    }
  }, [user]);

  const fetchMessages = useCallback(async () => {
    if (!user || !activeChannelId) return;
    setLoadingMessages(true);
    setError('');
    try {
      const response = await fetch(
        `/api/portal/chat/messages?userId=${user.uid}&channelId=${activeChannelId}&limit=50`
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load messages');
      setMessages(json.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeChannelId, user]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const sendMessage = async () => {
    if (!user || !activeChannelId || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/portal/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          channelId: activeChannelId,
          text: draft,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to send message');
      setDraft('');
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user || !activeChannelId) return;
    setDeletingId(messageId);
    setError('');
    try {
      const response = await fetch('/api/portal/chat/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          channelId: activeChannelId,
          messageId,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to delete message');
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (date: string | null) => {
    if (!date) return 'Just now';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <ProtectedRoute permissions={['chat:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                        Team Chat
                      </h1>
                      <Badge variant="outline" className="rounded-md border-[#8dc63f]/30 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300">
                        Free Firebase pilot
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                    Text-only team channels for onboarding, training, and manager coordination. No media hosting or paid chat vendor.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchMessages}
                  disabled={loadingMessages || !activeChannelId}
                >
                  <RefreshCcw className="size-4" />
                  Refresh
                </Button>
              </div>
              </section>

              {error && (
                <Alert className="border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid min-h-[680px] grid-cols-1 overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm lg:grid-cols-[320px_1fr]">
                <aside className="border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/70 lg:border-b-0 lg:border-r">
                  <div className="border-b border-slate-200 dark:border-border p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-foreground">
                      <MessageSquareText className="size-4 text-[#0A1F44] dark:text-foreground" />
                      Pilot Channels
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                      Latest 50 messages per channel to control read volume.
                    </p>
                  </div>
                  <div className="space-y-2 p-3">
                    {loadingChannels ? (
                      <div className="rounded-md border border-slate-200 dark:border-border bg-white dark:bg-card p-4 text-sm text-slate-500 dark:text-muted-foreground">
                        Loading channels...
                      </div>
                    ) : (
                      channels.map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => setActiveChannelId(channel.id)}
                          className={`w-full cursor-pointer rounded-md border p-3 text-left transition-colors duration-200 ${
                            channel.id === activeChannelId
                              ? 'border-[#8dc63f]/50 bg-[#8dc63f]/10 text-slate-950 dark:text-foreground'
                              : 'border-transparent bg-white dark:bg-card text-slate-700 dark:text-muted-foreground hover:border-slate-200 dark:hover:border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              {channel.audience === 'managers' ? (
                                <Lock className="size-4 text-slate-500 dark:text-muted-foreground" />
                              ) : (
                                <Hash className="size-4 text-slate-500 dark:text-muted-foreground" />
                              )}
                              {channel.name}
                            </span>
                            <Badge variant="secondary" className="text-[11px]">
                              {audienceCopy[channel.audience]}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-muted-foreground">
                            {channel.description}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </aside>

                <section className="flex min-h-[680px] flex-col">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-border p-4">
                    <div>
                      <h2 className="font-semibold text-slate-950 dark:text-foreground">
                        {activeChannel?.name ?? 'Select a channel'}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                        {activeChannel?.description ?? 'Choose a channel to view messages.'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-600 dark:text-muted-foreground">
                      {messages.length} shown
                    </Badge>
                  </div>

                  <div className="flex-1 space-y-3 overflow-auto bg-[linear-gradient(rgba(10,31,68,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(10,31,68,.025)_1px,transparent_1px)] bg-[size:24px_24px] p-4">
                    {loadingMessages ? (
                      <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card/90 py-0 shadow-sm">
                        <CardContent className="p-5 text-sm text-slate-500 dark:text-muted-foreground">
                          Loading messages...
                        </CardContent>
                      </Card>
                    ) : messages.length === 0 ? (
                      <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card/90 py-0 text-center shadow-sm">
                        <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                          <CardTitle className="text-base">No messages yet</CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 text-sm text-slate-500 dark:text-muted-foreground">
                          Start with a short update, question, or field note.
                        </CardContent>
                      </Card>
                    ) : (
                      messages.map((message) => {
                        const canDelete = canModerate || message.authorId === user?.uid;
                        return (
                          <div
                            key={message.id}
                            className="group rounded-md border border-slate-200 dark:border-border bg-white dark:bg-card/95 p-4 shadow-sm transition-colors duration-200 hover:border-slate-300"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-950 dark:text-foreground">
                                    {message.authorName}
                                  </span>
                                  {message.authorRole && (
                                    <Badge variant="secondary" className="text-[11px]">
                                      {message.authorRole.replace('_', ' ')}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-slate-500 dark:text-muted-foreground">
                                    {formatTime(message.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-muted-foreground">
                                  {message.text}
                                </p>
                              </div>
                              {canDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0 text-slate-400 dark:text-muted-foreground opacity-100 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/15 dark:hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                                  onClick={() => deleteMessage(message.id)}
                                  disabled={deletingId === message.id}
                                  aria-label="Delete message"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-slate-200 dark:border-border bg-white dark:bg-card p-4">
                    <div className="flex flex-col gap-3">
                      <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                        placeholder={
                          activeChannel
                            ? `Message ${activeChannel.name}...`
                            : 'Select a channel to send a message...'
                        }
                        disabled={!activeChannelId || sending}
                        rows={3}
                        className="resize-none"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500 dark:text-muted-foreground">
                          Text only. Do not post customer PII, card numbers, SSNs, or private credentials.
                        </p>
                        <Button
                          type="button"
                          onClick={sendMessage}
                          disabled={!activeChannelId || !draft.trim() || sending}
                          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                        >
                          <Send className="size-4" />
                          Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
