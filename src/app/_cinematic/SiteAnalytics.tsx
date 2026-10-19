"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { isNativeApp } from "@/lib/app/isNativeApp";

const subscribe = () => () => {};

/**
 * Vercel's cookieless page analytics, for the public site in a browser only.
 * The 3C Portal iPhone app opens /privacy and /terms in its WebView, and the
 * privacy policy promises no third-party analytics in the app, so inside the
 * app it never mounts. The server and hydration render nothing; the client
 * value (a browser: mount) takes over right after.
 */
export default function SiteAnalytics() {
  const enabled = useSyncExternalStore(subscribe, () => !isNativeApp(), () => false);
  return enabled ? <Analytics /> : null;
}
