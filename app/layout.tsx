import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
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
      <body>{children}</body>
    </html>
  );
}
