/**
 * useSettings — Zustand store con persistencia AsyncStorage
 * para preferencias de usuario (compartido Passenger + Driver).
 *
 * Estado persistente:
 *  - notificationsEnabled
 *  - promoNotificationsEnabled
 *  - darkMode (base para futuro theming)
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@bRide_settings';

interface SettingsState {
  notificationsEnabled: boolean;
  promoNotificationsEnabled: boolean;
  darkMode: boolean;
  loaded: boolean;
  lang: string;
  avatarUri: string | null;

  loadSettings: () => Promise<void>;
  toggleNotifications: () => void;
  togglePromo: () => void;
  toggleDarkMode: () => void;
  setLanguageGlobal: (lang: string) => void;
  setAvatar: (uri: string | null) => void;
}

const persist = async (partial: Partial<SettingsState>) => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = { ...current, ...partial };
    // Don't persist internal state
    delete next.loaded;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
};

export const useSettings = create<SettingsState>((set, get) => ({
  notificationsEnabled: true,
  promoNotificationsEnabled: true,
  darkMode: true,
  loaded: false,
  lang: 'es',
  avatarUri: null,

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          notificationsEnabled: parsed.notificationsEnabled ?? true,
          promoNotificationsEnabled: parsed.promoNotificationsEnabled ?? true,
          darkMode: parsed.darkMode ?? true,
          lang: parsed.lang ?? 'es',
          avatarUri: parsed.avatarUri ?? null,
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  toggleNotifications: () => {
    const next = !get().notificationsEnabled;
    set({ notificationsEnabled: next });
    persist({ notificationsEnabled: next });
  },

  togglePromo: () => {
    const next = !get().promoNotificationsEnabled;
    set({ promoNotificationsEnabled: next });
    persist({ promoNotificationsEnabled: next });
  },

  toggleDarkMode: () => {
    const next = !get().darkMode;
    set({ darkMode: next });
    persist({ darkMode: next });
  },

  setLanguageGlobal: (lang: string) => {
    set({ lang });
    persist({ lang });
  },

  setAvatar: (uri: string | null) => {
    set({ avatarUri: uri });
    persist({ avatarUri: uri });
  },
}));
