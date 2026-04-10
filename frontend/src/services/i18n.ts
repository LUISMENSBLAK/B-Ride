import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import it from '../locales/it.json';

// ─── Setup ────────────────────────────────────────────────────────────────────
const i18n = new I18n({ en, es, fr, de, it });

i18n.defaultLocale = 'es';
i18n.enableFallback  = true;
// Configuración de advertencias y fallback de missing keys se deja en default de la API
// i18n.missingBehavior = 'guess';

// ─── Persistence ─────────────────────────────────────────────────────────────
const LANG_KEY = '@bRide_language';

export async function initLocale(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    if (saved) {
      i18n.locale = saved;
    } else {
      const deviceLocales = Localization.getLocales();
      const deviceLang = deviceLocales[0]?.languageCode ?? 'es';
      i18n.locale = ['en', 'es', 'fr', 'de', 'it'].includes(deviceLang) ? deviceLang : 'es';
    }
  } catch (_) {
    i18n.locale = 'es';
  }
}

export async function setLanguage(lang: string): Promise<void> {
  i18n.locale = lang;
  try {
    await AsyncStorage.setItem(LANG_KEY, lang);
  } catch (_) {}
}

export function getLanguage(): string {
  return i18n.locale.split('-')[0];
}

// ─── Translate helper ────────────────────────────────────────────────────────
export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export default i18n;
