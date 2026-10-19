"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useIsNativeApp } from "@/lib/app/isNativeApp";
import kit from "./cinematic.module.css";
import s from "./app-legal-bar.module.css";

/**
 * /privacy and /terms inside the 3C iOS app, reached from the portal's legal
 * links. The public header and footer lead out to the marketing site and sit
 * under the notch, so in the app they give way to one bar below the status
 * bar with a back button to the portal. Renders nothing in a browser.
 */
export default function AppLegalBar() {
  const inApp = useIsNativeApp();
  const router = useRouter();
  if (!inApp) return null;

  const back = () => {
    // Opened from a portal page: step back to it. Landed here directly: the portal.
    if (window.history.length > 1) router.back();
    else router.replace("/portal");
  };

  return (
    <>
      <style>{`.${kit.header},.${kit.footer},.${kit.skipLink}{display:none!important}.${kit.pageHeadFlat}{padding-top:calc(env(safe-area-inset-top) + 6rem)}html,body{-webkit-tap-highlight-color:transparent}`}</style>
      <div className={s.bar}>
        <div className={s.row}>
          <button type="button" className={s.back} onClick={back}>
            <ChevronLeft size={26} strokeWidth={2.25} aria-hidden="true" />
            Portal
          </button>
        </div>
      </div>
    </>
  );
}
