import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGUAGES, resolveLanguage } from './languages';
import en from './locales/en.json';
import ja from './locales/ja.json';
import enUi from './locales/ui/en.json';
import jaUi from './locales/ui/ja.json';
import enShell from './locales/shell/en.json';
import jaShell from './locales/shell/ja.json';

export { LANGUAGES, isSupportedLanguage, resolveLanguage } from './languages';

const i18n = i18next.createInstance();
const resources = {
  en: { translation: { ...enUi, ...en, shell: enShell } },
  ja: { translation: { ...jaUi, ...ja, shell: jaShell } },
};

i18n.on('languageChanged', language => {
  if (globalThis.document) {
    document.documentElement.lang = language;
  }
});

// Built-in dictionaries are synchronous. English is available for startup
// errors and for callers running before the saved language has been read.
i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: Object.keys(LANGUAGES),
  initAsync: false,
  interpolation: { escapeValue: false },
});

export function initializeI18n(savedLanguage, browserLanguage) {
  return i18n.changeLanguage(resolveLanguage(savedLanguage, browserLanguage));
}

export function getLanguage() {
  return i18n.resolvedLanguage ?? 'en';
}

export function t(key, options) {
  return i18n.t(key, options);
}

export default i18n;
