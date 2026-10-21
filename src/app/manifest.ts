import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/tablet/',
    name: 'ForgeOS Tablet Reader',
    short_name: 'ForgeOS Reader',
    description: 'Assigned meter routes, protected offline readings and photo syncing.',
    start_url: '/tablet/index.html',
    scope: '/',
    display: 'standalone',
    background_color: '#f2f5f9',
    theme_color: '#13233b',
    icons: [
      { src: '/tablet-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/tablet-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/tablet-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
