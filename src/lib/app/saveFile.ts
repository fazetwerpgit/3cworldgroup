import { hasNativeBridge, requestNative } from './bridge';
import { isNativeApp } from './isNativeApp';

// In-app downloads (SPEC A5): a WebView cannot save a blob: link, so in the app
// the file goes over the bridge (saveFile) and the shell opens the share sheet.

/** True when downloads should go to the shell instead of an <a download>. */
export function shouldSaveViaApp(): boolean {
  return isNativeApp() && hasNativeBridge();
}

/** Base64 of raw bytes, chunked so large exports don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Strips a parameter suffix ("text/csv;charset=utf-8;" -> "text/csv"). */
export function baseMimeType(type: string): string {
  return type.split(';')[0].trim() || 'application/octet-stream';
}

/** Sends a file to the shell's share sheet. Resolves false if the person cancelled. */
export async function saveBlobViaApp(filename: string, blob: Blob): Promise<boolean> {
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  const result = await requestNative<'saveFile'>({
    type: 'saveFile',
    filename,
    mimeType: baseMimeType(blob.type),
    base64,
  });
  return result.completed;
}
