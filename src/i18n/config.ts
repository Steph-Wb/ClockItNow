import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './locales/de.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
] as const;

export type LangCode = typeof SUPPORTED_LANGUAGES[number]['code'];

const STORAGE_KEY = 'clockitnow_lang';

export function getSavedLang(): LangCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (saved === 'de' || saved === 'en') ? saved : 'de';
}

export function changeLanguage(lang: LangCode) {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  return i18n.changeLanguage(lang);
}

i18n
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    lng: getSavedLang(),
    fallbackLng: 'de',
    interpolation: { escapeValue: false }, // React escapes itself
    returnNull: false,
  });

// Setzt <html lang="…"> beim Start
document.documentElement.lang = i18n.language;

export default i18n;
