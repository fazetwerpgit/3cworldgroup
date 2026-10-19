// @vitest-environment jsdom
// Review item 14: a stalled upload has a Cancel that aborts it, clears the
// tile and unblocks Send; a timeout leaves Try again for the same file.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./RepShell', () => ({ useHideRepTabBar: () => {} }));
vi.mock('@/components/esign/PdfPages', () => ({
  PdfPages: ({ src }: { src: string }) => <div data-pdf-pages={src} />,
}));

import { Attachment } from './RepForm';
import { FormUploadError } from '@/lib/forms/uploadFormAttachment';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const photo = new File(['x'], 'proof.png', { type: 'image/png' });

async function render(upload: (file: File, signal: AbortSignal) => Promise<string>, onBusyChange = vi.fn()) {
  await act(async () => {
    root.render(
      <Attachment id="proof" label="Proof" accept="image/*" upload={upload} onUploaded={() => {}} onBusyChange={onBusyChange} />
    );
  });
  return onBusyChange;
}

async function choose(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function button(name: string) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === name) ?? null;
}

describe('Attachment upload cancel and retry', () => {
  it('Cancel aborts the request, clears the tile and unblocks Send', async () => {
    let seen: AbortSignal | null = null;
    const busy = await render((_file, signal) => {
      seen = signal;
      return new Promise<string>(() => {}); // stalled forever
    });
    await choose(photo);
    expect(container.textContent).toContain('Uploading…');
    expect(busy).toHaveBeenLastCalledWith(true);

    await act(async () => button('Cancel')!.click());

    expect(seen!.aborted).toBe(true);
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(container.textContent).toContain('Choose a file');
    expect(container.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(false);
  });

  it('a timeout offers Try again, which sends the same file again', async () => {
    const upload = vi
      .fn<(file: File, signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new FormUploadError('Upload timed out'))
      .mockResolvedValueOnce('forms/proof');
    const busy = await render(upload);
    await choose(photo);

    expect(container.textContent).toContain('Upload timed out');
    expect(busy).toHaveBeenLastCalledWith(false);

    await act(async () => button('Try again')!.click());

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0]).toBe(photo);
    expect(container.textContent).toContain('Attached');
  });

  it('a failed Replace keeps showing the file the form still submits', async () => {
    const upload = vi
      .fn<(file: File, signal: AbortSignal) => Promise<string>>()
      .mockResolvedValueOnce('forms/proof')
      .mockRejectedValueOnce(new FormUploadError('Upload timed out'))
      .mockResolvedValueOnce('forms/other');
    await render(upload);
    await choose(photo);
    const other = new File(['y'], 'other.png', { type: 'image/png' });
    await choose(other); // through the Replace input

    expect(container.textContent).toContain('proof.png');
    expect(container.textContent).toContain('Attached');
    expect(container.textContent).not.toContain('Not attached');
    expect(container.textContent).toContain('Upload timed out');

    await act(async () => button('Try again')!.click());

    expect(upload.mock.calls[2][0]).toBe(other);
    expect(container.textContent).toContain('other.png');
    expect(container.textContent).not.toContain('Upload timed out');
  });

  it('leaving the page mid-upload aborts it and unblocks Send', async () => {
    let seen: AbortSignal | null = null;
    const busy = await render((_file, signal) => {
      seen = signal;
      return new Promise<string>(() => {});
    });
    await choose(photo);
    act(() => root.render(<p />));
    expect(seen!.aborted).toBe(true);
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('a PDF gets View too, drawn in the page rather than a blob tab', async () => {
    await render(async () => 'forms/proof');
    await choose(new File(['%PDF'], 'stub.pdf', { type: 'application/pdf' }));
    expect(container.textContent).toContain('Attached');

    await act(async () => button('View')!.click());

    expect(document.body.querySelector('[role=dialog] [data-pdf-pages="blob:x"]')).not.toBeNull();
    expect(document.body.querySelector('[role=dialog] img')).toBeNull();
  });
});
