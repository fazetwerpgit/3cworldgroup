// What a rep types is stripped of customer contact details before it goes to
// the model or the log: emails become [email], US phone numbers [phone].
// Photos go as they are (owner decision).

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// 10 digits, optionally +1 / 1 first, in the usual groupings: 5125550142,
// 512-555-0142, 512.555.0142, (512) 555-0142, +1 512 555 0142. Not part of a
// longer run of letters or digits, so order numbers are left alone.
const PHONE = /(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;

export function redactContact(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}
