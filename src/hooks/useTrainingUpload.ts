'use client';

import { useCallback, useState } from 'react';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { isAllowedTrainingUpload, sanitizeFileName } from '@/lib/training/fileKind';

export interface UploadedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

// Uploads a training file straight to Firebase Storage with progress. The
// caller passes a unique uploadId so each resource gets its own folder.
export function useTrainingUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = useCallback(
    (file: File, uploadId: string): Promise<UploadedFile | null> => {
      setError('');
      const check = isAllowedTrainingUpload(file.type, file.size);
      if (!check.ok) {
        setError(check.error);
        return Promise.resolve(null);
      }
      if (!storage) {
        setError('Storage is not configured');
        return Promise.resolve(null);
      }
      const safeName = sanitizeFileName(file.name);
      const storagePath = `training/${uploadId}/${safeName}`;
      setUploading(true);
      setProgress(0);
      return new Promise((resolve) => {
        const task = uploadBytesResumable(ref(storage!, storagePath), file, {
          contentType: file.type,
        });
        task.on(
          'state_changed',
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          (err) => {
            setUploading(false);
            setError(err.message || 'Upload failed');
            resolve(null);
          },
          () => {
            setUploading(false);
            setProgress(100);
            resolve({ storagePath, fileName: safeName, mimeType: file.type, fileSize: file.size });
          }
        );
      });
    },
    []
  );

  return { upload, progress, uploading, error };
}
