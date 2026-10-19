import { isNativeApp } from './isNativeApp';
import { postToNative } from './bridge';

// In the 3C iOS app, the WebView's edge-swipe back gesture (BRIDGE.md
// backGestures) would kick a rep out of the solar presenter deck mid-pitch.
// The deck turns it off while mounted. The shell also turns it back on whenever
// the WebView leaves the deck URL, so a missed restore cannot stick. Older
// shells ignore the message. Never posts on the web.

/** Turns the shell's swipe-back gestures off. Returns the restore, for an effect cleanup. */
export function disableBackGestures(): () => void {
  if (!isNativeApp()) return () => {};
  postToNative({ type: 'backGestures', enabled: false });
  return () => {
    postToNative({ type: 'backGestures', enabled: true });
  };
}
