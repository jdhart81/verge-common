'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export function ShareActivity({
  path,
  title,
  referral,
}: {
  path: string;
  title: string;
  referral?: string;
}) {
  const [message, setMessage] = useState(''),
    [qr, setQr] = useState('');
  function shareUrl() {
    const url = new URL(path, location.origin);
    if (referral) url.searchParams.set('ref', referral);
    return url.href;
  }
  async function share() {
    const url = shareUrl();
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Public activity link copied.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setMessage(`Share this public link: ${url}`);
    }
  }
  return (
    <div className="mt-5">
      <div className="button-row">
        <Button variant="outline" onClick={share}>
          Share this activity
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const QR = await import('qrcode');
              setQr(
                await QR.toDataURL(shareUrl(), {
                  width: 240,
                  margin: 2,
                }),
              );
            } catch {
              setMessage('QR code could not load. Use the public link.');
            }
          }}
        >
          Show QR code
        </Button>
      </div>
      {qr && (
        <Image
          unoptimized
          src={qr}
          width={240}
          height={240}
          alt={`QR code for ${title}`}
        />
      )}
      <output>{message}</output>
      {referral && (
        <p className="small">
          This link includes a source code. Joining records that source
          privately so the co-op can measure participant referrals.
        </p>
      )}
    </div>
  );
}
