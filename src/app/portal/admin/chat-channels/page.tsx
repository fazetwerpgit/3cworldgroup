'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { ChatChannelAudience } from '@/types';

type ManagedChannel = {
  id: string;
  name: string;
  description: string;
  audience: ChatChannelAudience;
  order: number;
  active: boolean;
  memberCount: number;
};

type ChannelDraft = {
  name: string;
  description: string;
  audience: ChatChannelAudience;
};

const audienceCopy: Record<ChatChannelAudience, string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

const emptyDraft: ChannelDraft = { name: '', description: '', audience: 'all' };

export default function AdminChatChannelsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ManagedChannel[]>([]);
  const [draft, setDraft] = useState<ChannelDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ChannelDraft>(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
    });
  }, []);

  const loadChannels = useCallback(async () => {
    if (!user) return;
    try {
      setError('');
      const res = await authedFetch('/api/portal/chat/channels/manage');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load chat channels');
      setChannels(json.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat channels');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess((current) => (current === message ? '' : current)), 3000);
  };

  const createChannel = async () => {
    try {
      setError('');
      setSuccess('');
      setSaving(true);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create channel');
      setDraft(emptyDraft);
      await loadChannels();
      showSuccess('Channel created. Members were added automatically by role.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (channel: ManagedChannel) => {
    setEditingId(channel.id);
    setConfirmDeleteId(null);
    setEditDraft({
      name: channel.name,
      description: channel.description,
      audience: channel.audience,
    });
    setSuccess('');
  };

  const saveChannel = async (id: string) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update channel');
      setEditingId(null);
      await loadChannels();
      showSuccess('Channel updated. Membership was refreshed automatically.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSavingId(null);
    }
  };

  const archiveChannel = async (channel: ManagedChannel) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(channel.id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channel.id, active: !channel.active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update channel');
      await loadChannels();
      showSuccess(channel.active ? 'Channel archived.' : 'Channel restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSavingId(null);
    }
  };

  const deleteChannel = async (id: string) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete channel');
      setConfirmDeleteId(null);
      await loadChannels();
      showSuccess(`Channel deleted. ${json.deletedMessages || 0} message${json.deletedMessages === 1 ? '' : 's'} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <ProtectedRoute roles={['admin']}>
      <div className="mx-auto max-w-[1200px] space-y-5">
        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
              Team Chat Channels
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
              Create, rename, and remove channels. Members are added automatically by role.
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-4 py-3 text-sm text-[#4f7f1e] dark:text-[#b9e78a]">
            {success}
          </div>
        )}

        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
          <CardHeader className="border-b border-slate-200 px-5 py-4 dark:border-border">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">
                Create channel
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                New channels appear live after role-based members are saved.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_1.4fr_220px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="channel-name" className="text-slate-700 dark:text-muted-foreground">Name</Label>
              <Input
                id="channel-name"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={60}
                placeholder="Announcements"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-description" className="text-slate-700 dark:text-muted-foreground">Description</Label>
              <Input
                id="channel-description"
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                maxLength={200}
                placeholder="What this channel is for"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-audience" className="text-slate-700 dark:text-muted-foreground">Audience</Label>
              <NativeSelect
                id="channel-audience"
                className="w-full"
                value={draft.audience}
                onChange={(e) => setDraft((prev) => ({ ...prev, audience: e.target.value as ChatChannelAudience }))}
              >
                {Object.entries(audienceCopy).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              onClick={createChannel}
              disabled={saving}
              className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
            >
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
            <CardContent className="py-10 text-center text-sm text-slate-600 dark:text-muted-foreground">
              Loading chat channels...
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
            <CardHeader className="border-b border-slate-200 px-5 py-4 dark:border-border">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">
                  Existing channels
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                  {channels.length} channel{channels.length === 1 ? '' : 's'} configured
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {channels.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
                  No channels yet. Create one above.
                </p>
              ) : (
                channels.map((channel) => (
                  <div key={channel.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-muted">
                    {editingId === channel.id ? (
                      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_200px_auto_auto] md:items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`edit-name-${channel.id}`} className="text-slate-700 dark:text-muted-foreground">Name</Label>
                          <Input
                            id={`edit-name-${channel.id}`}
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                            maxLength={60}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-description-${channel.id}`} className="text-slate-700 dark:text-muted-foreground">Description</Label>
                          <Input
                            id={`edit-description-${channel.id}`}
                            value={editDraft.description}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))}
                            maxLength={200}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-audience-${channel.id}`} className="text-slate-700 dark:text-muted-foreground">Audience</Label>
                          <NativeSelect
                            id={`edit-audience-${channel.id}`}
                            className="w-full"
                            value={editDraft.audience}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, audience: e.target.value as ChatChannelAudience }))}
                          >
                            {Object.entries(audienceCopy).map(([value, label]) => (
                              <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </div>
                        <Button
                          type="button"
                          onClick={() => saveChannel(channel.id)}
                          disabled={savingId === channel.id}
                          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                        >
                          {savingId === channel.id ? 'Saving...' : 'Save'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-950 dark:text-foreground">
                              {channel.name}
                            </h3>
                            {!channel.active && (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-background dark:text-muted-foreground">
                                Archived
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
                            {channel.description || 'No description'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                            {audienceCopy[channel.audience]} · {channel.memberCount} member{channel.memberCount === 1 ? '' : 's'} · #{channel.id}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => beginEdit(channel)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => archiveChannel(channel)}
                            disabled={savingId === channel.id}
                          >
                            {channel.active ? 'Archive' : 'Restore'}
                          </Button>
                          {confirmDeleteId === channel.id ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => deleteChannel(channel.id)}
                                disabled={savingId === channel.id}
                                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15"
                              >
                                {savingId === channel.id ? 'Deleting...' : 'Confirm delete'}
                              </Button>
                              <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setConfirmDeleteId(channel.id);
                                setEditingId(null);
                              }}
                              className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}
