import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings } from '../api';
import { changeLanguage, type LangCode } from '../i18n';
import { useApi } from './useApi';

/**
 * Hält die UI-Sprache mit den Server-Settings synchron (Browser ↔ Electron).
 * - Server-Sprache gesetzt und abweichend → lokal übernehmen (kein PUT, keine Schleife;
 *   der Fokus-Refetch von useApi zieht Änderungen aus anderen Fenstern nach)
 * - Server-Sprache noch nie gesetzt → aktuelle lokale Sprache einmalig übernehmen
 */
export function useLanguageSync(): void {
  const { i18n } = useTranslation();
  const { data, reload } = useApi(getSettings, []);

  useEffect(() => {
    if (!data) return;
    if (data.ui_lang && data.ui_lang !== i18n.language) {
      changeLanguage(data.ui_lang);
    } else if (data.ui_lang == null) {
      updateSettings({ ui_lang: i18n.language as LangCode })
        .then(() => reload())
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
