import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { removeTokenFromBackend } from '../services/notifications/NotificationService';
import socketService from '../services/socket';
import eventManager from '../services/EventManager'; // FIX-4: import para limpiar en logout

// BUG-018: SecureStore lazy-loaded para evitar crash en Expo Go/simulador sin rebuild nativo
// Se carga dinámicamente solo si el módulo existe en el entorno
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SecureStore = require('expo-secure-store');
} catch {
  // expo-secure-store no disponible en este entorno (Expo Go sin rebuild)
  // Fallback silencioso a AsyncStorage
  if (__DEV__) console.log('[AuthStore] expo-secure-store no disponible, usando AsyncStorage como fallback');
}

const SECURE_KEYS = {
  ACCESS_TOKEN:  'b_ride_access_token',
  REFRESH_TOKEN: 'b_ride_refresh_token',
} as const;

async function secureSet(key: string, value: string): Promise<void> {
  try {
    if (SecureStore) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch { /* fallback */ }
  await AsyncStorage.setItem(key, value);
}

async function secureGet(key: string): Promise<string | null> {
  try {
    if (SecureStore) {
      return await SecureStore.getItemAsync(key);
    }
  } catch { /* fallback */ }
  return AsyncStorage.getItem(key);
}

async function secureDelete(key: string): Promise<void> {
  try {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
  } catch { /* fallback */ }
  await AsyncStorage.removeItem(key);
}

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    accessToken: string;
    refreshToken: string;
    avgRating?: number;
    totalRatings?: number;
    phoneNumber?: string;
    avatarUrl?: string;
    profilePhoto?: string;
    approvalStatus?: 'NOT_SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
    driverApprovalStatus?: 'NOT_SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    justRegistered: boolean;
    login: (userData: User) => Promise<void>;
    register: (userData: User) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    updateUser: (data: Partial<User>) => Promise<void>;
    clearJustRegistered: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    justRegistered: false,
    login: async (userData) => {
        // BUG-018: Tokens JWT en SecureStore (con fallback a AsyncStorage si no disponible)
        if (userData.accessToken)  await secureSet(SECURE_KEYS.ACCESS_TOKEN,  userData.accessToken);
        if (userData.refreshToken) await secureSet(SECURE_KEYS.REFRESH_TOKEN, userData.refreshToken);
        // Metadata de perfil (sin tokens sensibles) en AsyncStorage
        const safeUserInfo = { ...userData, accessToken: '', refreshToken: '' };
        await AsyncStorage.setItem('userInfo', JSON.stringify(safeUserInfo));
        set({ user: userData, justRegistered: false });
    },
    register: async (userData) => {
        if (userData.accessToken)  await secureSet(SECURE_KEYS.ACCESS_TOKEN,  userData.accessToken);
        if (userData.refreshToken) await secureSet(SECURE_KEYS.REFRESH_TOKEN, userData.refreshToken);
        const safeUserInfo = { ...userData, accessToken: '', refreshToken: '' };
        await AsyncStorage.setItem('userInfo', JSON.stringify(safeUserInfo));
        set({ user: userData, justRegistered: true });
    },
    logout: async () => {
        try {
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            // BUG-035: EAS_PROJECT_ID_PLACEHOLDER nombre más descriptivo
            const EAS_PROJECT_ID_PLACEHOLDER = 'REEMPLAZAR_CON_TU_EAS_PROJECT_ID';
            const isValidProjectId = projectId && projectId !== EAS_PROJECT_ID_PLACEHOLDER;
            if (isValidProjectId) {
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                if (tokenData?.data) await removeTokenFromBackend(tokenData.data);
            }
        } catch (e) {
            if (__DEV__) console.log('[AuthStore] Error al remover push token:', e);
        }

        // BUG-018: Borrar tokens del SecureStore (o AsyncStorage como fallback)
        await secureDelete(SECURE_KEYS.ACCESS_TOKEN);
        await secureDelete(SECURE_KEYS.REFRESH_TOKEN);
        await AsyncStorage.multiRemove(['userInfo', 'lastCompletedRideId',
          // Limpiar también claves legacy por si el usuario venía de una versión anterior
          'userToken', 'refreshToken']);
        eventManager.reset(); // FIX-4: limpiar listeners y eventos procesados antes de desconectar
        socketService.disconnect();
        set({ user: null });
    },
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            // BUG-018: Leer token del SecureStore (o AsyncStorage como fallback)
            // Migración transparente: si hay token legacy en AsyncStorage, migrarlo
            let token = await secureGet(SECURE_KEYS.ACCESS_TOKEN);
            if (!token) {
              // Migración desde versión anterior que guardaba en AsyncStorage
              token = await AsyncStorage.getItem('userToken');
              if (token) {
                await secureSet(SECURE_KEYS.ACCESS_TOKEN, token);
                await AsyncStorage.removeItem('userToken');
              }
            }

            const userInfoStr = await AsyncStorage.getItem('userInfo');

            if (!token || !userInfoStr) {
                set({ user: null });
                return;
            }

            const cachedUser = JSON.parse(userInfoStr);
            const fullUser = { ...cachedUser, accessToken: token };
            set({ user: fullUser });
            set({ isLoading: false }); // FIX 1: Desbloquea la UI de inmediato

            try {
                const res = await client.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` },
                    // @ts-ignore — flag interno para suprimir alert en el interceptor
                    _silent: true,
                });
                if (res.data?.data) {
                    const merged = { ...fullUser, ...res.data.data, accessToken: token };
                    const safeUserInfo = { ...merged, accessToken: '', refreshToken: '' };
                    await AsyncStorage.setItem('userInfo', JSON.stringify(safeUserInfo));
                    set({ user: merged });
                }
            } catch (apiErr: unknown) {
                const status = (apiErr as { response?: { status?: number } })?.response?.status;
                if (status === 401 || status === 403) {
                    await secureDelete(SECURE_KEYS.ACCESS_TOKEN);
                    await secureDelete(SECURE_KEYS.REFRESH_TOKEN);
                    await AsyncStorage.multiRemove(['userInfo', 'lastCompletedRideId', 'userToken', 'refreshToken']);
                    set({ user: null });
                }
            }
        } catch (e) {
            set({ user: null });
        } finally {
            set({ isLoading: false });
        }
    },
    updateUser: async (data: Partial<User>) => {
        set((state) => {
            if (!state.user) return state;
            const updated = { ...state.user, ...data };
            const safeUserInfo = { ...updated, accessToken: '', refreshToken: '' };
            AsyncStorage.setItem('userInfo', JSON.stringify(safeUserInfo)).catch(() => {});
            return { user: updated };
        });
    },
    clearJustRegistered: () => {
        set({ justRegistered: false });
    },
}));
