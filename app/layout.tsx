import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://verge-common-community.jdhart.chatgpt.site'),
  title: 'Verge Common — Care for a place. Build a commons.',
  description:
    'Open-source tools for neighbors to plan local stewardship, share what works, and care for the places they call home.',
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
