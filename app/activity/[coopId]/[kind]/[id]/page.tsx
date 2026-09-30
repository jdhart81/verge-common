import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getPublicActivity, ownShareSource } from '@/server/public-activity';
import { ActivityJoin } from '@/components/activity-join';
import { ShareActivity } from '@/components/share-activity';
import { BrandLogo } from '@/components/brand-logo';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ coopId: string; kind: string; id: string }> };
export async function generateMetadata({ params }: Props) {
  const { coopId, kind, id } = await params;
  const a = await getPublicActivity(coopId, kind, id);
  if (!a)
    return {
      title: 'Activity unavailable · VergeCommon',
      robots: { index: false, follow: false },
    };
  return {
    title: `${a.title} · VergeCommon`,
    description: a.summary.slice(0, 200),
    alternates: { canonical: a.path },
    openGraph: {
      title: a.title,
      description: a.summary.slice(0, 200),
      url: a.path,
      type: 'website',
      images: [
        {
          url: '/brand/shared-canopy-logo-v1.png',
          width: 992,
          height: 397,
          alt: 'VergeCommon Shared Canopy',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: a.title,
      description: a.summary.slice(0, 200),
      images: ['/brand/shared-canopy-logo-v1.png'],
    },
  };
}
export default async function Activity({ params }: Props) {
  const { coopId, kind, id } = await params;
  const a = await getPublicActivity(coopId, kind, id);
  if (!a) notFound();
  const user = await getChatGPTUser();
  const referral = user ? await ownShareSource(coopId, user.userId) : undefined;
  return (
    <main className="wrap network">
      <Link className="brand" href="/network/">
        <BrandLogo />
      </Link>
      <section className="panel mt-8">
        <p className="eyebrow">
          {a.coop.name} · {a.coop.region}
        </p>
        <h1>{a.title}</h1>
        <p className="intro whitespace-pre-wrap">{a.summary}</p>
        {kind === 'event' && (
          <>
            <p>
              {new Date(a.record.startsAt).toLocaleString('en', {
                timeZone: a.record.timeZone,
              })}{' '}
              ({a.record.timeZone})
            </p>
            <p>
              {a.record.status === 'completed'
                ? 'Activity completed'
                : 'Help with this shared activity'}
            </p>
            {a.record.result && (
              <div className="notice">
                <h2>Work completed</h2>
                <p className="whitespace-pre-wrap">{a.record.result.summary}</p>
                <p>
                  {a.record.result.attendeeCount} confirmed participants ·{' '}
                  {a.record.result.review}
                </p>
                <p className="small">
                  Community attendance and work records are not certification of
                  ecological outcomes.
                </p>
              </div>
            )}
          </>
        )}
        <ShareActivity path={a.path} title={a.title} referral={referral} />
        <ActivityJoin coopId={coopId} path={a.path} signedIn={!!user} />
        <p className="small">
          A steward reviews membership before private meeting instructions and
          records become available.
        </p>
        <Link href={`/network/?coop=${coopId}`} prefetch={false}>
          More from this co-op →
        </Link>
      </section>
    </main>
  );
}
