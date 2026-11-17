import { headers } from 'next/headers';
import { HomeContent } from '@/components/home-content';
import { HINDI_HOME_REVIEWED } from '@/lib/i18n/home';
import { resolveHomeLocale } from '@/lib/i18n/locale.mjs';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const requestHeaders = await headers();
  const requested = resolveHomeLocale(requestHeaders.get('accept-language'));
  return <HomeContent locale={HINDI_HOME_REVIEWED ? requested : 'en'} />;
}
