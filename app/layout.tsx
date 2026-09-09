import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
export const metadata: Metadata = {
  appleWebApp: { capable: true, title: 'Verge Common', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  metadataBase: new URL('https://verge-common-community.jdhart.chatgpt.site'),
  title: 'Verge Common — Cooperative conservation infrastructure.',
  description:
    'Open-source cooperative infrastructure for EcoHedge projects, conservation agreements, pooled carbon accounting, and transparent member payouts.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" /><meta name="theme-color" content="#17513b" /></head>
      <body>{children}<AppShell /></body>
    </html>
  );
}
