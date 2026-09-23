'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { Button } from '@/components/ui/button';
import { maybeDownscale } from '@/lib/forms/uploadFormAttachment';

interface FileUploadProps {
  itemId: string;
  slot?: string;
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
      setState('uploaded');
      onUploaded(json.path as string);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-border dark:bg-card">
      {label && <p className="mb-2 text-xs font-medium text-slate-600 dark:text-muted-foreground">{label}</p>}
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
      {state === 'uploaded' && previewUrl && (
        <div className="mt-3">
          <button
            type="button"
            aria-label="View uploaded image"
            className="cursor-zoom-in text-left"
            onClick={() => setLightboxImage({ url: previewUrl, alt: 'Uploaded image' })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Uploaded image"
              className="h-16 w-auto max-w-[120px] rounded-md border border-slate-200 object-cover dark:border-border"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-muted-foreground">
              Tap to view
            </span>
          </button>
        </div>
      )}
      <ChatLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
}
