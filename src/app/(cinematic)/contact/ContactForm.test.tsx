// @vitest-environment jsdom
// /contact: the sent panel is brought into view, the phone check, and the message cap.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContactForm from './ContactForm';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

beforeEach(async () => {
  window.sessionStorage.clear();
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ContactForm />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const field = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;

async function type(id: string, value: string) {
  const el = field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

async function fillValid() {
  await type('contact-name', 'Sam Caller');
  await type('contact-email', 'sam@example.com');
  await type('contact-subject', 'services');
  await type('contact-message', 'Is fiber available?');
}

const submit = () => act(async () => container.querySelector<HTMLButtonElement>('button[type=submit]')!.click());

describe('ContactForm', () => {
  it('labels the support subject "Help With My Service" and keeps its value', () => {
    const option = container.querySelector<HTMLOptionElement>('#contact-subject option[value="support"]')!;
    expect(option.textContent).toBe('Help With My Service');
  });

  it('points job seekers at the application only when the subject is careers, and still sends', async () => {
    expect(container.querySelector('#contact-subject-note')).toBeNull();
    await type('contact-subject', 'careers');
    const note = field('contact-subject-note');
    expect(note.textContent).toBe('Looking for a job? Apply here so a recruiter gets it.');
    expect(note.querySelector('a')!.getAttribute('href')).toBe('/apply');
    expect(field('contact-subject').getAttribute('aria-describedby')).toBe('contact-subject-note');

    await type('contact-subject', 'services');
    expect(container.querySelector('#contact-subject-note')).toBeNull();

    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await fillValid();
    await type('contact-subject', 'careers');
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe('careers');
  });

  it('scrolls the sent panel into view and focuses its heading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 })));
    await fillValid();
    await submit();

    const heading = container.querySelector('h3')!;
    expect(heading.textContent).toBe('Message sent.');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts[0]).toBe(heading.parentElement);
    expect(document.activeElement).toBe(heading);
  });

  it('blocks a phone that is not a US number and shows the field message', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await fillValid();
    await type('contact-phone', 'not a phone');
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(field('contact-phone-error').textContent).toBe('Enter a valid phone number.');
  });

  it('blocks a blank-only name or message and names the field, as the server trims them', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await fillValid();
    await type('contact-name', '   ');
    await type('contact-message', '\n  \t');
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(field('contact-name-error').textContent).toBe('Enter your full name.');
    expect(field('contact-name').getAttribute('aria-invalid')).toBe('true');
    expect(field('contact-message-error').textContent).toBe('Write your message.');

    await type('contact-name', 'Sam Caller');
    expect(field<HTMLInputElement>('contact-name').validity.valid).toBe(true);
  });

  it('caps the message at the server limit and shows a counter near it', async () => {
    const box = field<HTMLTextAreaElement>('contact-message');
    expect(box.maxLength).toBe(4000);
    expect(container.querySelector('#contact-message-count')).toBeNull();

    await type('contact-message', 'x'.repeat(3700));
    expect(field('contact-message-count').textContent).toBe('3700 / 4000 characters');
    expect(box.getAttribute('aria-describedby')).toBe('contact-message-count');
  });
});
