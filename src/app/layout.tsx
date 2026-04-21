import type { Metadata } from 'next';
import { JetBrains_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { DarkModeApplier } from '@/components/layout/DarkModeApplier';
import { PrivyAuthProvider } from '@/components/providers/PrivyAuthProvider';
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
  'Every trade is committed on-chain before execution. Reasoning hash → MYX order → execution reveal, all verifiable on BscScan. No trust required.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'NeuroDegen — On-Chain Proof of AI Reasoning',
    template: '%s · NeuroDegen',
  },
  description: DESCRIPTION,
  applicationName: 'NeuroDegen',
  keywords: ['BNB Chain', 'Four.meme', 'MYX Finance', 'DGrid', 'Pieverse', 'autonomous agent', 'on-chain attestation'],
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
    title: 'NeuroDegen — On-Chain Proof of AI Reasoning',
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'NeuroDegen' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuroDegen',
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
        <PrivyAuthProvider>{children}</PrivyAuthProvider>
      </body>
    </html>
  );
}
