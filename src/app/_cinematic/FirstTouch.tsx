"use client";

import { useEffect } from "react";
import { recordFirstTouch } from "@/lib/forms/applicationSource";

/**
 * Notes how this browser session reached the site, on its first public page:
 * referrer host, landing path and any utm tags, in sessionStorage. No cookie,
 * nothing sent anywhere; /apply reads it back only if the visitor applies.
 * The layout keeps this mounted across client navigations, and the record is
 * never overwritten, so it stays the first touch.
 */
export default function FirstTouch() {
  useEffect(() => {
    recordFirstTouch();
  }, []);
  return null;
}
