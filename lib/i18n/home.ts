import { en } from './en';
import { hi } from './hi';

export type HomeLocale = 'en' | 'hi';

export function getHomeStrings(locale: HomeLocale) {
  return locale === 'hi' ? hi : en;
}
