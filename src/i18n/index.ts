export { default } from './config';
export { changeLanguage, getSavedLang, SUPPORTED_LANGUAGES } from './config';
export type { LangCode } from './config';

import type { TFunction } from 'i18next';

/**
 * Übersetzt Backend-Fehler-Keys (z.B. 'errors.auth.invalidCredentials').
 * Unbekannte Strings (Netzwerkfehler etc.) werden unverändert zurückgegeben.
 */
export function translateError(t: TFunction, message: string): string {
  if (!message) return '';
  if (message.startsWith('errors.')) return t(message);
  return message;
}
