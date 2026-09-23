// @vitest-environment jsdom
//
// The proof upload queue: a stalled upload can be cancelled, a failure reads
// as "Upload failed" (never the browser's text), and a pick over the cap says
// so instead of dropping files silently.
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn();
vi.mock('@/lib/forms/uploadFormAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/forms/uploadFormAttachment')>();
  return { ...actual, uploadFormAttachment: (args: unknown) => uploadMock(args) };
});
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => null }));

import { FormUploadError } from '@/lib/forms/uploadFormAttachment';
import { proofUploadMessage, useProofUploads, type ProofUploads } from './ProofCapture';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const latest: { current: ProofUploads | null } = { current: null };

function Harness() {
  const [paths, setPaths] = useState<string[]>([]);
  const uploads = useProofUploads({
    paths,
    onAdd: (path) => setPaths((prev) => [...prev, path]),
    onRemove: (path) => setPaths((prev) => prev.filter((p) => p !== path)),
    slotKey: 'a'.repeat(32),
  });
  useEffect(() => {
    latest.current = uploads;
  });
  return null;
}

const api = new Proxy({} as ProofUploads, {
  get: (_target, key) => (latest.current as unknown as Record<PropertyKey, unknown>)[key],
});

const png = (name = 'shot.png') => new File([new Uint8Array([1])], name, { type: 'image/png' });

/** An upload that hangs until its signal aborts. */
function stalled() {
  uploadMock.mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      })
  );
}

beforeEach(async () => {
  uploadMock.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: null }), { status: 200 })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('useProofUploads', () => {
  it('cancels a stalled upload: aborts the request and drops the tile', async () => {
    stalled();
    await act(async () => void api.addFiles([png()]));
    expect(api.tiles.map((t) => t.kind)).toEqual(['uploading']);
    expect(api.uploadingCount).toBe(1);
    const signal = uploadMock.mock.calls[0][0].signal as AbortSignal;

    await act(async () => api.discard(api.tiles[0].key));
    expect(signal.aborted).toBe(true);
    expect(api.tiles).toEqual([]);
    expect(api.uploadingCount).toBe(0);
  });

  it('shows "Upload failed" for a raw browser error and retries on request', async () => {
    uploadMock.mockRejectedValueOnce(new TypeError('Load failed'));
    await act(async () => void api.addFiles([png()]));
    expect(api.tiles[0]).toMatchObject({ kind: 'failed', error: 'Upload failed' });

    uploadMock.mockResolvedValueOnce('form-attachments/r1/sale-proof/x_111111/');
    await act(async () => api.retry(api.tiles[0].key));
    expect(api.tiles.map((t) => t.kind)).toEqual(['done']);
  });

  it('retries with the bytes it already read, never the picked file again', async () => {
    const picked = png();
    const read = vi.spyOn(picked, 'arrayBuffer');
    uploadMock.mockRejectedValueOnce(new FormUploadError('Upload timed out'));
    await act(async () => void api.addFiles([picked]));
    expect(read).toHaveBeenCalledTimes(1);
    const first = uploadMock.mock.calls[0][0] as { file: File; prepared: boolean };
    expect(first.prepared).toBe(true);

    // Android has let go of the picked file by now.
    read.mockRejectedValue(new Error('NotReadableError'));
    uploadMock.mockResolvedValueOnce('form-attachments/r1/sale-proof/x_222222/');
    await act(async () => api.retry(api.tiles[0].key));

    expect(read).toHaveBeenCalledTimes(1);
    expect((uploadMock.mock.calls[1][0] as { file: File }).file).toBe(first.file);
    expect(api.tiles.map((t) => t.kind)).toEqual(['done']);
  });

  it('keeps a timeout as its own message', async () => {
    uploadMock.mockRejectedValueOnce(new FormUploadError('Upload timed out'));
    await act(async () => void api.addFiles([png()]));
    expect(api.tiles[0]).toMatchObject({ kind: 'failed', error: 'Upload timed out' });
  });

  it('tells the rep when a pick goes over four and takes the first four', async () => {
    stalled();
    let taken = 0;
    await act(async () => {
      taken = api.addFiles([png('1.png'), png('2.png'), png('3.png'), png('4.png'), png('5.png')]);
    });
    expect(taken).toBe(4);
    expect(api.overCap).toBe(true);
    await act(async () => api.discard(api.tiles[0].key));
    expect(api.overCap).toBe(false);
  });
});

describe('proofUploadMessage', () => {
  it('passes our wording and hides everything else', () => {
    expect(proofUploadMessage(new FormUploadError('Use a photo or a screenshot'))).toBe('Use a photo or a screenshot');
    expect(proofUploadMessage(new Error('The network connection was lost.'))).toBe('Upload failed');
    expect(proofUploadMessage('weird')).toBe('Upload failed');
  });
});
