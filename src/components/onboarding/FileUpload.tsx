'use client';

import { useRef, useState } from 'react';
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  itemId: string;
  slot?: 'front' | 'back';
  uploadUrl: string;
  accept: string;
  allowedTypes: string[];
  maxSizeMb?: number;
  extraFields?: Record<string, string>;
  getHeaders?: () => Promise<HeadersInit>;
  label?: string;
  existingPath?: string;
  onUploaded: (folderPath: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';

// MIME types we can safely re-encode on a canvas to shrink large phone photos.
const DOWNSCALABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Downscale a large image client-side so it fits under the body-size cap.
// Returns the original file when it already fits or cannot be decoded.
async function maybeDownscale(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !DOWNSCALABLE.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function FileUpload({
  itemId,
  slot,
  uploadUrl,
  accept,
  allowedTypes,
  maxSizeMb = 4,
  extraFields = {},
  getHeaders,
  label,
  existingPath,
  onUploaded,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>(existingPath ? 'uploaded' : 'idle');
  const [fileName, setFileName] = useState(existingPath ? 'Uploaded' : '');
  const [error, setError] = useState('');

  const handleFile = async (selected: File) => {
    setError('');

    // Client-side type pre-check (mirrors the server allowlist) for instant feedback.
    if (!allowedTypes.includes(selected.type)) {
      setState('error');
      setError('Unsupported file type');
      return;
    }

    const maxBytes = maxSizeMb * 1024 * 1024;
    const file = await maybeDownscale(selected, maxBytes);
    if (file.size > maxBytes) {
      setState('error');
      setError(`File must be ${maxSizeMb} MB or smaller`);
      return;
    }

    setState('uploading');
    setFileName(file.name);

    try {
      const body = new FormData();
      body.set('itemId', itemId);
      if (slot) body.set('slot', slot);
      for (const [k, v] of Object.entries(extraFields)) body.set(k, v);
      body.set('file', file);

      const headers = getHeaders ? await getHeaders() : undefined;
      const response = await fetch(uploadUrl, { method: 'POST', headers, body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Upload failed');

      setState('uploaded');
      onUploaded(json.path as string);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      {label && <p className="mb-2 text-xs font-medium text-slate-600">{label}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the input so re-selecting the same file fires onChange again.
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={state === 'uploading'}
        >
          {state === 'uploading' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          {state === 'uploaded' ? 'Replace file' : 'Choose file'}
        </Button>
        {state === 'uploaded' && (
          <span className="flex items-center gap-1 text-sm text-[#4f7f1e] dark:text-green-300">
            <CheckCircle2 className="size-4" />
            {fileName || 'Uploaded'}
          </span>
        )}
        {state === 'error' && (
          <span className="flex items-center gap-1 text-sm text-red-600">
            <AlertTriangle className="size-4" />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
