import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileMenuProvider } from '@/contexts/MobileMenuContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import OnboardingGate from '@/components/portal/OnboardingGate';
import FirestoreResumeGuard from '@/components/portal/FirestoreResumeGuard';
import PushTokenRefresher from '@/components/portal/PushTokenRefresher';
import PwaBottomGap from '@/components/portal/PwaBottomGap';
import ServiceWorkerRegistrar from '@/components/portal/ServiceWorkerRegistrar';
import '@/styles/sweep-shell.css';

// Display face for portal brand moments (login, KPI headers) — exposed as
// --font-archivo and consumed by the .portal-display helper in globals.css.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

// Tints the opaque iOS standalone status bar to match the D top bar (--c-bar).
export const viewport = {
  themeColor: "#070f1c",
};

export const metadata: Metadata = {
  title: "Employee Portal | 3C World Group",
  description: "3C World Group employee portal - access your dashboard, training, and resources.",
  robots: { index: false, follow: false },
  // PWA: manifest (public/manifest.webmanifest) + iOS home-screen app behavior.
  // Linked from the portal only, so the public site never offers to install it.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // Not "black-translucent": with viewport-fit=cover, iOS 26+ standalone
    // sizes the web view one status bar (~59pt on Dynamic Island phones) short
    // and leaves an unpaintable strip under the fixed tab bar (WebKit bug
    // 301108). "default" gives an opaque status bar tinted by theme-color and
    // a correctly sized view; safe-area-inset-top then reads 0.
    statusBarStyle: "default",
    title: "3C Console",
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout wraps the portal with Theme, Auth and MobileMenu providers.
  return (
    <ThemeProvider>
      <AuthProvider>
        <MobileMenuProvider>
          <ServiceWorkerRegistrar />
          {/* Heals iOS push-subscription rotation on every open — see component. */}
          <PushTokenRefresher />
          {/* Reconnects live data (chat, unread dot) when the app resumes. */}
          <FirestoreResumeGuard />
          {/* Drops the bottom bars onto the screen edge in iOS 26 installs. */}
          <PwaBottomGap />
          {/* .portal-scope gates the portal reskin tokens/overrides in
              globals.css; display:contents keeps it out of the layout. */}
          <div className={`portal-scope contents ${archivo.variable}`}>
            <OnboardingGate>{children}</OnboardingGate>
          </div>
        </MobileMenuProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
