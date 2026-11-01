/**
 * Selects the supported home-page language from an Accept-Language header
 * or an ordered navigator.languages list.
 *
 * @param {string | readonly string[] | null | undefined} preferences
 * @returns {'en' | 'hi'}
 */
export function resolveHomeLocale(preferences) {
  const header = Array.isArray(preferences)
    ? preferences.join(',')
    : typeof preferences === 'string' ? preferences : '';

  let selected = 'en';
  let highestQuality = -1;

  for (const entry of header.split(',')) {
    const [rawLanguage, ...params] = entry.trim().split(';');
    const language = rawLanguage.trim().toLowerCase();

    const locale = /^hi(?:-|$)/.test(language)
      ? 'hi'
      : /^en(?:-|$)/.test(language)
        ? 'en'
        : null;

    if (!locale) continue;

    const qualityParam = params.find((param) => /^\s*q\s*=/.test(param));
    const quality = qualityParam
      ? Number(qualityParam.split('=')[1].trim())
      : 1;

    if (!Number.isFinite(quality) || quality <= 0 || quality > 1) {
      continue;
    }

    if (quality > highestQuality) {
      selected = locale;
      highestQuality = quality;
    }
  }

  return selected;
}
