import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import './playful.css';
import './ecosystem.css';
import './sidebar.css';
import './welcome-banner.css';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const origin = protocol + '://' + host;
  return {
    title: 'Letria · Uma aventura em cada palavra',
    description: 'Pequenas descobertas. Grandes aventuras. Alfabetização, ilhas interativas e pensamento computacional para aprender com a Lumi, na escola e em família.',
    applicationName: 'Letria', manifest: '/manifest.webmanifest',
    icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
    openGraph: {
      title: 'Letria · Pequenas descobertas. Grandes aventuras.',
      description: 'Um universo para aprender brincando.',
      images: [{ url: origin + '/og.png', width: 1733, height: 907, alt: 'Letria: pequenas descobertas, grandes aventuras. Lumi explora uma ilha com letras e uma trilha.' }],
      locale: 'pt_BR', type: 'website',
    },
    twitter: {
      card: 'summary_large_image', title: 'Letria · Pequenas descobertas. Grandes aventuras.',
      description: 'Um universo para aprender brincando.', images: [origin + '/og.png'],
    },
  };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#7650dc' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
