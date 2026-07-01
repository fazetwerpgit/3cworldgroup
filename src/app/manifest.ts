import type { MetadataRoute } from 'next';

// Web app manifest — makes the portal installable to a phone/desktop home screen
// and run full-screen (no browser chrome), like a native app. Brand navy theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '3C Console — Employee Portal',
    short_name: '3C Console',
    description: 'The 3C World Group employee portal — sales, chat, training, and more.',
    start_url: '/portal/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A1F44',
    theme_color: '#0A1F44',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
