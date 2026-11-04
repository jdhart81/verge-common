import { useSyncExternalStore } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HomeContent } from '../components/home-content';
import type { HomeLocale } from '../lib/i18n/home';
import { resolveHomeLocale } from '../lib/i18n/locale.mjs';
import Demo from '../app/demo/page';
import '../app/globals.css';

function subscribeToLanguageChange(onChange: () => void) {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

function getBrowserLocale(): HomeLocale {
  const preferences = navigator.languages?.length
    ? navigator.languages
    : navigator.language;
  return resolveHomeLocale(preferences);
}

function getServerLocale(): HomeLocale {
  return 'en';
}

function LocalizedPublicHome() {
  // The static HTML is English. React uses the server snapshot during hydration,
  // then reads the browser language without a synchronous setState in an effect.
  const locale = useSyncExternalStore(
    subscribeToLanguageChange,
    getBrowserLocale,
    getServerLocale,
  );
  return <HomeContent publicPreview locale={locale} />;
}

const content = window.location.pathname === '/demo/'
  ? <Demo />
  : <LocalizedPublicHome />;

hydrateRoot(document.getElementById('root')!, content);
