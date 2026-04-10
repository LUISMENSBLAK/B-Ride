import { useCallback } from 'react';
import i18n, { setLanguage, t } from '../services/i18n';
import { useSettings } from './useSettings';

/**
 * useTranslation — forces a re-render
 * whenever the app language changes via global useSettings.
 */
export function useTranslation() {
  const { lang, setLanguageGlobal } = useSettings();

  const setLang = useCallback(async (next: string) => {
    await setLanguage(next);
    setLanguageGlobal(next);
  }, []);

  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => t(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang]
  );

  return { t: translate, lang, setLang };
}
