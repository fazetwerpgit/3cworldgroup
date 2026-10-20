// A consultant's Google Calendar connection as the portal shows it. This is
// the non-secret mirror kept on solarAvailability/{uid}.googleCalendar; the
// refresh token itself lives in solarGoogleTokens/{uid} (server only, see
// lib/solar/google/connection.ts). Pure, so the Setup UI can import it.

export interface GoogleCalendarStatus {
  /** True while the portal can use the calendar. */
  connected: boolean;
  /** The Google account's email ('' when Google didn't share it). */
  email: string;
  /** ISO time of the last successful connect. */
  connectedAt: string;
  /** False when the person didn't grant the free/busy scope: slots aren't filtered. */
  freeBusy: boolean;
  /** Google refused the saved token (revoked, password change): reconnect to use it again. */
  needsReconnect?: boolean;
}

function isoOf(value: unknown): string {
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? '' : new Date(value).toISOString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  const toDate = (value as { toDate?: () => Date } | null)?.toDate;
  if (typeof toDate === 'function') {
    const d = toDate.call(value);
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : '';
  }
  return '';
}

/** The stored mirror, cleaned; undefined when the consultant never connected. */
export function googleStatusOf(value: unknown): GoogleCalendarStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const connected = v.connected === true;
  const needsReconnect = v.needsReconnect === true;
  if (!connected && !needsReconnect) return undefined;
  return {
    connected,
    email: typeof v.email === 'string' ? v.email : '',
    connectedAt: isoOf(v.connectedAt),
    freeBusy: v.freeBusy !== false,
    ...(needsReconnect ? { needsReconnect: true } : {}),
  };
}

/** True when bookings should go on this consultant's Google Calendar. */
export function usesGoogleCalendar(status: GoogleCalendarStatus | undefined): boolean {
  return status?.connected === true;
}

/** True when this consultant's slots are filtered by their Google free/busy. */
export function usesGoogleFreeBusy(status: GoogleCalendarStatus | undefined): boolean {
  return status?.connected === true && status.freeBusy;
}

/** Why a connect failed: the callback's ?reason=, read by the Setup banner and the landing page. */
export type ConnectError = 'denied' | 'bad_state' | 'expired' | 'reused' | 'scope' | 'exchange' | 'not_consultant' | 'server';

const CONNECT_ERROR_TEXT: Record<ConnectError, string> = {
  denied: 'Google sign-in was cancelled, so nothing changed.',
  bad_state: "That sign-in link wasn't valid. Start again from Solar setup.",
  expired: 'That sign-in link expired. Start again from Solar setup.',
  reused: 'That sign-in link was already used. Start again from Solar setup.',
  scope: 'Calendar access was left unticked, so nothing was connected. Connect again and allow it.',
  exchange: "Google didn't finish the sign-in. Try again.",
  not_consultant: 'Only a saved consultant can connect a calendar.',
  server: "Something went wrong on our side. Try again.",
};

/** The sentence for a failed connect (any unknown reason reads as a generic failure). */
export function connectErrorText(reason: string | null | undefined): string {
  return (reason && CONNECT_ERROR_TEXT[reason as ConnectError]) || CONNECT_ERROR_TEXT.server;
}
