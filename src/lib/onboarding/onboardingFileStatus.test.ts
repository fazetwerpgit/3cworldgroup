import { describe, expect, it } from 'vitest';
import { isAppleMobile, onboardingFileItemStatus, opensInViewer } from './onboardingFileStatus';

const esign = { referenceKind: 'esign' as const, onHold: false };

describe('onboarding file item status', () => {
  it('reads Out for signature only when an envelope exists and the item is unsigned', () => {
    expect(onboardingFileItemStatus({ ...esign, status: 'submitted', envelopeSent: true }).label).toBe(
      'Out for signature'
    );
    expect(onboardingFileItemStatus({ ...esign, status: 'submitted', envelopeSent: false }).label).toBe('Not sent yet');
    expect(onboardingFileItemStatus({ ...esign, status: 'not_started', envelopeSent: false }).label).toBe(
      'Not sent yet'
    );
    expect(onboardingFileItemStatus({ ...esign, status: 'approved', envelopeSent: true }).label).toBe('Approved');
  });

  it('keeps the other states as they are', () => {
    expect(
      onboardingFileItemStatus({ referenceKind: 'storage', onHold: false, status: 'submitted', envelopeSent: false })
        .label
    ).toBe('Needs review');
    expect(
      onboardingFileItemStatus({ referenceKind: 'storage', onHold: false, status: 'not_started', envelopeSent: false })
        .label
    ).toBe('Not started');
    expect(onboardingFileItemStatus({ ...esign, status: 'rejected', envelopeSent: true }).label).toBe('Rejected');
    expect(onboardingFileItemStatus({ ...esign, onHold: true, status: 'submitted', envelopeSent: true }).label).toBe(
      'On hold'
    );
  });
});

describe('which uploads open in the in-app viewer', () => {
  const url = (name: string) => `https://storage.example/onboarding/u/insurance/${name}?X-Goog-Signature=abc`;
  it('opens photos and PDFs in the page, leaves HEIC as a link', () => {
    expect(opensInViewer({ url: url('front.jpg'), contentType: 'image/jpeg' })).toBe(true);
    expect(opensInViewer({ url: url('file.pdf'), contentType: 'application/pdf' })).toBe(true);
    expect(opensInViewer({ url: url('front.heic'), contentType: 'image/heic' })).toBe(false);
    // The viewer picks PDF mode from the URL, so a PDF without .pdf stays a link.
    expect(opensInViewer({ url: url('file'), contentType: 'application/pdf' })).toBe(false);
  });
});

describe('which devices save the zip through the share sheet', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const IPAD_DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

  it('is iPhone, iPod and iPad (including iPadOS with a Mac UA)', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 5)).toBe(true);
    expect(isAppleMobile(IPAD_DESKTOP_UA, 5)).toBe(true);
  });

  it('is not Android, a real Mac, or Windows', () => {
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
    expect(isAppleMobile(IPAD_DESKTOP_UA, 0)).toBe(false);
    expect(isAppleMobile(WINDOWS, 0)).toBe(false);
  });
});
