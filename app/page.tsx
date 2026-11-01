import { headers } from 'next/headers';
import { HomeContent } from '@/components/home-content';
import { resolveHomeLocale } from '@/lib/i18n/locale.mjs';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const requestHeaders = await headers();
  const locale = resolveHomeLocale(requestHeaders.get('accept-language'));
  return <HomeContent locale={locale} />;
}
