'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  CALL_DAY_ORDER,
  CallAudience,
  CallAudienceLabels,
  CallDay,
  CallDayLabels,
} from '@/types';

interface CallEntry {
  id: string;
  title: string;
  description: string;
  day: CallDay;
  time: string;
  timezone: string;
  meetLink: string;
  audience: CallAudience;
  createdByName: string;
}

interface CallsResponse {
  calls: CallEntry[];
  canManage: boolean;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  day: 'monday' as CallDay,
  time: '09:00',
  timezone: 'America/Chicago',
  meetLink: '',
  audience: 'all' as CallAudience,
};

// "18:30" -> "6:30 PM"
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export default function CallsSchedulePage() {
  const { user } = useAuth();
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/calls?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load call schedule');
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call schedule');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleCreate = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/portal/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          createdBy: user.uid,
          createdByName: user.displayName || user.email,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to add call');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add call');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (call: CallEntry) => {
    if (!user) return;
    setDeletingId(call.id);
    setError('');
    try {
      const response = await fetch('/api/portal/calls', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, requestedBy: user.uid }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to remove call');
      }
      await fetchCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove call');
    } finally {
      setDeletingId(null);
    }
  };

  // Group by day in week order
  const byDay = CALL_DAY_ORDER.map((day) => ({
    day,
    calls: (data?.calls ?? []).filter((c) => c.day === day),
  })).filter((g) => g.calls.length > 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0A1F44]">Calls Schedule</h1>
                  <p className="text-gray-500 mt-1">
                    Recurring team calls - join with the Google Meet link
                  </p>
                </div>
                {data?.canManage && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-4 py-2 bg-[#8dc63f] text-white rounded-lg text-sm font-medium hover:bg-[#7ab82e] transition-colors"
                  >
                    Add Call
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading schedule...</p>
                </div>
              ) : byDay.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <p className="text-3xl mb-2">📅</p>
                  <p className="font-semibold text-gray-900">No calls scheduled</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {data?.canManage
                      ? 'Add the first recurring call above.'
                      : 'Check back soon - your team calls will show up here.'}
                  </p>
                </div>
              ) : (
                byDay.map(({ day, calls }) => (
                  <div key={day} className="space-y-3">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                      {CallDayLabels[day]}
                    </h2>
                    {calls.map((call) => (
                      <div
                        key={call.id}
                        className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-gray-900">{call.title}</h3>
                              {call.audience === 'managers' && (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                                  {CallAudienceLabels[call.audience]}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {formatTime(call.time)}
                              {call.timezone ? ` (${call.timezone})` : ''} · every{' '}
                              {CallDayLabels[call.day]}
                            </p>
                            {call.description && (
                              <p className="text-sm text-gray-500 mt-1">{call.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={call.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-[#0A1F44] text-white rounded-lg text-sm font-medium hover:bg-[#13294f] transition-colors"
                            >
                              Join Meet
                            </a>
                            {data?.canManage && (
                              <button
                                onClick={() => handleDelete(call)}
                                disabled={deletingId === call.id}
                                className="px-3 py-2 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                {deletingId === call.id ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Add-call modal (ops/admin) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#0A1F44]">Add Recurring Call</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Morning Huddle"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                <select
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value as CallDay })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
                >
                  {CALL_DAY_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {CallDayLabels[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Meet Link
              </label>
              <input
                type="url"
                value={form.meetLink}
                onChange={(e) => setForm({ ...form, meetLink: e.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              />
              <p className="text-xs text-gray-400 mt-1">
                Calls run on Google Meet - paste the meeting link here.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
              <select
                value={form.audience}
                onChange={(e) =>
                  setForm({ ...form, audience: e.target.value as CallAudience })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              >
                {(Object.keys(CallAudienceLabels) as CallAudience[]).map((a) => (
                  <option key={a} value={a}>
                    {CallAudienceLabels[a]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="What this call covers..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                }}
                disabled={saving}
                className="px-4 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.title.trim() || !form.meetLink.trim()}
                className="px-4 py-2 bg-[#8dc63f] text-white rounded-lg text-sm font-medium hover:bg-[#7ab82e] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Adding...' : 'Add Call'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
