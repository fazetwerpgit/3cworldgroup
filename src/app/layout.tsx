import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@fontsource/bebas-neue/latin-400.css";
import "./globals.css";
import "./public.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "3C World Group | Fiber Internet, TV & Security Solutions",
  description: "Nationwide B2C sales solutions for fiber internet, TV services, and security systems. Join our team of successful independent contractors.",
  // PWA: manifest + iOS home-screen app behavior + touch icon.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "3C Console",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1F44",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
      suppressHydrationWarning is here for one attribute: the (cinematic) group's
      layout opens its motion gate with a blocking inline script that sets
      `data-motion` on this element before React hydrates, so the server HTML and
      the client tree legitimately differ by that attribute and React would
      otherwise log a mismatch on every cinematic page load. It suppresses
      warnings for this element's own attributes only, not for its subtree.
    */
    /*
      `data-scroll-behavior="smooth"` is how Next 16 is told that the smooth
      scrolling declared in globals.css is deliberate. The router turns it off
      for the one moment it restores a scroll position on a route change — a
      navigation that smooth-scrolls there instead of arriving there reads as
      the page sliding out from under you — and without the attribute it cannot
      tell whether the rule is authored or inherited, so it warns on every
      transition instead. The attribute only marks the declaration; it does not
      create it, and the reduced-motion override in globals.css still wins.

      It is inert outside the cinematic group: the portal declares no smooth
      scrolling, so there is nothing here for the router to suspend.
    */
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
