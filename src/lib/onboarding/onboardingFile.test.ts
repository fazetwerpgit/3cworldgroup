import { describe, expect, it } from 'vitest';
import { personFilePrefix, signedPdfFileName, uniqueName, uploadFileName } from './onboardingFile';

describe('onboarding file names', () => {
  it('puts the last name first and keeps only safe characters', () => {
    expect(personFilePrefix('Alex Rivera')).toBe('Rivera-Alex');
    expect(personFilePrefix('Mary Ann  O\'Neil')).toBe('O-Neil-Mary-Ann');
    expect(personFilePrefix('José Núñez')).toBe('Nunez-Jose');
    expect(personFilePrefix('Cher')).toBe('Cher');
    expect(personFilePrefix('  ')).toBe('Employee');
    expect(personFilePrefix('../../etc')).toBe('etc');
  });

  it('names signed PDFs and uploads for the item', () => {
    expect(signedPdfFileName('Rivera-Alex', 'w9')).toBe('Rivera-Alex-W9-signed.pdf');
    expect(signedPdfFileName('Rivera-Alex', 'direct_deposit')).toBe('Rivera-Alex-Direct-deposit-signed.pdf');
    expect(uploadFileName('Rivera-Alex', 'dl_photos', 'front.JPG')).toBe('Rivera-Alex-Drivers-license-front.jpg');
    expect(uploadFileName('Rivera-Alex', 'insurance', 'file.pdf')).toBe('Rivera-Alex-Insurance.pdf');
    expect(uploadFileName('Rivera-Alex', 'llc_sos', 'noext')).toBe('Rivera-Alex-LLC-SOS-noext');
  });

  it('never repeats a name inside one zip', () => {
    const taken = new Set<string>();
    expect(uniqueName('a.pdf', taken)).toBe('a.pdf');
    expect(uniqueName('a.pdf', taken)).toBe('a-2.pdf');
    expect(uniqueName('a.pdf', taken)).toBe('a-3.pdf');
  });
});
