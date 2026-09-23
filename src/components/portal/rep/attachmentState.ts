import { friendlyError } from '@/lib/forms/friendlyError';
import { FormUploadError, isUploadCancelled } from '@/lib/forms/uploadFormAttachment';

// State of one Attachment slot. Each upload gets a run number; a result from a
// run that was cancelled or replaced is ignored, so a late answer from a
// stalled request can never overwrite what the rep did since.

/** How an attached file can be shown in the page: a photo, a PDF, or not at all. */
export type FileView = 'image' | 'pdf' | null;

export type AttachDone = { kind: 'done'; name: string; localUrl: string | null; view: FileView };

export type AttachState =
  | { kind: 'idle' }
  /** `prev` is the file already attached when this one is a Replace. */
  | { kind: 'uploading'; name: string; run: number; prev: AttachDone | null }
  | AttachDone
  /** `retry`: the same file can be sent again (timeout, no signal, server hiccup). */
  | { kind: 'error'; message: string; retry: boolean; name: string };

export type AttachAction =
  | { type: 'start'; run: number; name: string }
  | { type: 'done'; run: number; name: string; localUrl: string | null; view: FileView }
  | { type: 'fail'; run: number; message: string; retry: boolean }
  | { type: 'cancel' };

export function fileView(file: Pick<File, 'type' | 'name'>): FileView {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  return null;
}

export function attachReducer(state: AttachState, action: AttachAction): AttachState {
  switch (action.type) {
    case 'start': {
      const prev = state.kind === 'done' ? state : state.kind === 'uploading' ? state.prev : null;
      return { kind: 'uploading', name: action.name, run: action.run, prev };
    }
    case 'done':
      if (state.kind !== 'uploading' || state.run !== action.run) return state;
      return { kind: 'done', name: action.name, localUrl: action.localUrl, view: action.view };
    case 'fail':
      if (state.kind !== 'uploading' || state.run !== action.run) return state;
      return { kind: 'error', message: action.message, retry: action.retry, name: state.name };
    case 'cancel':
      // A cancelled Replace keeps the file that was already attached.
      if (state.kind !== 'uploading') return state;
      return state.prev ?? { kind: 'idle' };
  }
}

export const UPLOAD_TIMED_OUT = 'Upload timed out';

/**
 * How a rejected upload reads on the tile. Messages written for the rep (wrong
 * type, too big, unreadable file) show as they are and need another file; a
 * timeout or a network or server failure can send the same file again.
 */
export type UploadFailure = { cancelled: true } | { cancelled: false; message: string; retry: boolean };

export function uploadFailure(error: unknown): UploadFailure {
  if (isUploadCancelled(error)) return { cancelled: true };
  const raw = error instanceof Error ? error.message : '';
  const message = raw ? friendlyError(raw, 'upload').message : 'Upload failed';
  // Rep-worded FormUploadErrors are about the file itself, except the timeout.
  const retry = !(error instanceof FormUploadError) || raw === UPLOAD_TIMED_OUT;
  return { cancelled: false, message, retry };
}
