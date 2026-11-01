import { useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HomeContent } from '../components/home-content';
import type { HomeLocale } from '../lib/i18n/home';
import { resolveHomeLocale } from '../lib/i18n/locale.mjs';
import Demo from '../app/demo/page';
import '../app/globals.css';

function LocalizedPublicHome() {
  // Match the English static HTML on the first render to avoid hydration errors.
  const [locale, setLocale] = useState<HomeLocale>('en');

  useEffect(() => {
    const preferences = navigator.languages?.length
      ? navigator.languages
      : navigator.language;
    setLocale(resolveHomeLocale(preferences));
  }, []);

  return <HomeContent publicPreview locale={locale} />;
}

const content = window.location.pathname === '/demo/'
  ? <Demo />
  : <LocalizedPublicHome />;

hydrateRoot(document.getElementById('root')!, content);
