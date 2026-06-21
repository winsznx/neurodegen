import type { Metadata } from 'next';
import { JetBrains_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { DarkModeApplier } from '@/components/layout/DarkModeApplier';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neurodegen.xyz';

const DESCRIPTION =
  'Three agents debate. One decision. Your keys never leave your wallet. Every committee decision is committed on-chain before TWAK signs the trade.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'NeuroDegen V2 - Investment Committee on BNB Chain',
    template: '%s · NeuroDegen',
  },
  description: DESCRIPTION,
  applicationName: 'NeuroDegen',
  keywords: [
    'BNB Chain',
    'Trust Wallet',
    'TWAK',
    'CoinMarketCap',
    'CMC Hub',
    'investment committee',
    'autonomous agent',
    'on-chain attestation',
    'self-custody',
  ],
  authors: [{ name: 'NeuroDegen Team' }],
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icon.svg'],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: APP_URL,
    siteName: 'NeuroDegen',
    title: 'NeuroDegen V2 - Investment Committee on BNB Chain',
    description: DESCRIPTION,
    images: [
      { url: '/opengraph-image', width: 1200, height: 630, alt: 'NeuroDegen' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuroDegen V2',
    description: DESCRIPTION,
    images: ['/twitter-image'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${ibmPlexSans.variable} ${spaceGrotesk.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <DarkModeApplier />
        {children}
      </body>
    </html>
  );
}
