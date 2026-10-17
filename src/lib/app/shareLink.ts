import { hasNativeBridge, requestNative } from './bridge';
import { isNativeApp } from './isNativeApp';

// Sharing a link. In the iOS app a "copy link" button opens the native share
// sheet instead (Messages, Mail, Copy are all in it); a WebView's clipboard
// write is unreliable and gives no feedback there.

/** True when links should go to the shell's share sheet instead of the clipboard. */
export function shouldShareViaApp(): boolean {
  return isNativeApp() && hasNativeBridge();
}

/** Opens the shell's share sheet. Resolves false if the person closed it without acting. */
export async function shareLinkViaApp(url: string, title?: string): Promise<boolean> {
  const result = await requestNative<'share'>({ type: 'share', url, ...(title ? { title } : {}) });
  return result.completed;
}
