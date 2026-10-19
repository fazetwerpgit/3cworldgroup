import { describe, expect, it } from 'vitest';
import { failedStatusLabel, lostStatusLabel, pendingStatusLabel } from './chatFormat';
import { messageFileInfo } from './FileChip';

const pdf = new File(['%PDF-'], 'invoice.pdf', { type: 'application/pdf' });
const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

describe('pending echo status labels', () => {
  it('calls a failed PDF send a PDF, not a photo', () => {
    expect(failedStatusLabel({ pendingFile: pdf, localPreviewUrl: 'blob:pdf' })).toBe('PDF not sent');
    expect(failedStatusLabel({ pendingFile: photo, localPreviewUrl: 'blob:jpg' })).toBe('Photo not sent');
    expect(failedStatusLabel({})).toBe('Not sent');
  });

  it('says a PDF is uploading, not a photo', () => {
    expect(pendingStatusLabel({ pendingFile: pdf, uploadProgress: 0.4 })).toBe('Uploading PDF · 40%');
    expect(pendingStatusLabel({ pendingFile: photo, uploadProgress: 0.4 })).toBe('Uploading photo · 40%');
    expect(pendingStatusLabel({ pendingFile: pdf, uploadProgress: 1 })).toBe('Sending…');
  });

  it('names a restored PDF (file still in the device outbox, or lost) by its stored file info', () => {
    const info = { name: 'invoice.pdf', type: 'application/pdf', size: 1200 };
    expect(failedStatusLabel({ photoPending: true, pendingFileInfo: info })).toBe('PDF not sent');
    expect(lostStatusLabel({ pendingFileInfo: info })).toBe('PDF not sent');
    expect(lostStatusLabel({ pendingFileInfo: { name: 'a.jpg', type: 'image/jpeg' } })).toBe('Photo not sent');
    expect(lostStatusLabel({})).toBe('Photo not sent');
    // Android pickers can drop the MIME: the .pdf name still marks it.
    expect(failedStatusLabel({ photoPending: true, pendingFileInfo: { name: 'scan.pdf', type: '' } })).toBe('PDF not sent');
  });

  it('labels an echo whose PDF is already uploaded as a PDF', () => {
    expect(failedStatusLabel({ attachment: { type: 'file', url: 'https://x/a.pdf' } })).toBe('PDF not sent');
  });
});

describe('messageFileInfo for a restored PDF', () => {
  it('shows a file chip, not a loading-photo tile, before the file loads back', () => {
    expect(
      messageFileInfo({ pendingFileInfo: { name: 'invoice.pdf', type: 'application/pdf', size: 1200 }, pendingState: 'sending' })
    ).toEqual({ name: 'invoice.pdf', size: 1200 });
    expect(messageFileInfo({ pendingFileInfo: { name: 'a.jpg', type: 'image/jpeg' }, pendingState: 'sending' })).toBeNull();
  });
});
