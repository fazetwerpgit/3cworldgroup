import { describe, expect, it } from 'vitest';
import { FormUploadError } from '@/lib/forms/uploadFormAttachment';
import { attachReducer, fileView, uploadFailure, type AttachDone, type AttachState } from './attachmentState';

const idle: AttachState = { kind: 'idle' };
const attached: AttachDone = { kind: 'done', name: 'old.png', localUrl: 'blob:old', view: 'image' };

describe('attachReducer', () => {
  it('cancel clears a first upload back to an empty slot', () => {
    const uploading = attachReducer(idle, { type: 'start', run: 1, name: 'a.png' });
    expect(uploading.kind).toBe('uploading');
    expect(attachReducer(uploading, { type: 'cancel' })).toEqual(idle);
  });

  it('cancel on a Replace keeps the file already attached', () => {
    const uploading = attachReducer(attached, { type: 'start', run: 2, name: 'new.png' });
    expect(attachReducer(uploading, { type: 'cancel' })).toBe(attached);
  });

  it('ignores a late result from a cancelled run', () => {
    const cancelled = attachReducer(attachReducer(idle, { type: 'start', run: 1, name: 'a.png' }), { type: 'cancel' });
    const late = attachReducer(cancelled, { type: 'done', run: 1, name: 'a.png', localUrl: null, view: 'image' });
    expect(late).toEqual(idle);
  });

  it('ignores a result from an older run once a new one started', () => {
    let state = attachReducer(idle, { type: 'start', run: 1, name: 'a.png' });
    state = attachReducer(state, { type: 'start', run: 2, name: 'b.png' });
    state = attachReducer(state, { type: 'fail', run: 1, message: 'Upload timed out', retry: true });
    expect(state).toMatchObject({ kind: 'uploading', run: 2 });
    state = attachReducer(state, { type: 'done', run: 2, name: 'b.png', localUrl: null, view: 'image' });
    expect(state).toMatchObject({ kind: 'done', name: 'b.png' });
  });

  it('a timeout leaves a retryable error', () => {
    const state = attachReducer(attachReducer(idle, { type: 'start', run: 1, name: 'a.png' }), {
      type: 'fail',
      run: 1,
      message: 'Upload timed out',
      retry: true,
    });
    expect(state).toEqual({ kind: 'error', message: 'Upload timed out', retry: true, name: 'a.png' });
  });
});

describe('uploadFailure', () => {
  it('treats the rep cancelling as no failure at all', () => {
    expect(uploadFailure(new DOMException('Upload cancelled', 'AbortError'))).toEqual({ cancelled: true });
  });

  it('offers Retry after a timeout', () => {
    expect(uploadFailure(new FormUploadError('Upload timed out'))).toEqual({
      cancelled: false,
      message: 'Upload timed out',
      retry: true,
    });
  });

  it('asks for another file when the file itself is the problem', () => {
    expect(uploadFailure(new FormUploadError('File must be 4 MB or smaller'))).toMatchObject({ retry: false });
  });

  it('words a network failure plainly and offers Retry', () => {
    expect(uploadFailure(new TypeError('Load failed'))).toEqual({
      cancelled: false,
      message: 'No signal. Check your connection and upload again.',
      retry: true,
    });
  });
});

describe('fileView', () => {
  it('views photos and PDFs in the page, nothing else', () => {
    expect(fileView({ type: 'image/heic', name: 'a.heic' })).toBe('image');
    expect(fileView({ type: 'application/pdf', name: 'stub.pdf' })).toBe('pdf');
    // Some pickers leave the type empty; the extension still says PDF.
    expect(fileView({ type: '', name: 'Stub.PDF' })).toBe('pdf');
    expect(fileView({ type: 'text/plain', name: 'notes.txt' })).toBeNull();
  });
});
