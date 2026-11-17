import { en } from './en';
import { hi } from './hi';

export type HomeLocale = 'en' | 'hi';

// The Hindi home page is written and tested but has not been read by a Hindi speaker.
// Until it has, every visitor gets English. Set this to true in the change that records
// who reviewed it; nothing else needs to change.
export const HINDI_HOME_REVIEWED = false;

export function getHomeStrings(locale: HomeLocale) {
  return locale === 'hi' ? hi : en;
}
