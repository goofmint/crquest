export const LANGUAGES = Object.freeze({
  en: 'English',
  ja: '日本語',
});

export function isSupportedLanguage(language) {
  return typeof language === 'string' && Object.hasOwn(LANGUAGES, language);
}

export function resolveLanguage(savedLanguage, browserLanguage = globalThis.navigator?.language) {
  if (isSupportedLanguage(savedLanguage)) {
    return savedLanguage;
  }
  const browserCode = browserLanguage?.split('-')[0].toLowerCase();
  return isSupportedLanguage(browserCode) ? browserCode : 'en';
}
