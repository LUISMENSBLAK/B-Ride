import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store'; // BUG-018: SecureStore para tokens JWT
import client from '../api/client';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { removeTokenFromBackend } from '../services/notifications/NotificationService';
import socketService from '../services/socket';
import eventManager from '../services/EventManager'; // FIX-4: import para limpiar en logout

// BUG-018: Helpers de SecureStore con fallback graceful a AsyncStorage si falla
const SECURE_KEYS = {
  ACCESS_TOKEN:  'b_ride_access_token',
  REFRESH_TOKEN: 'b_ride_refresh_token',
} as const;

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    // Fallback AsyncStorage si SecureStore no está disponible (ej. entorno de prueba)
    await AsyncStorage.setItem(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return AsyncStorage.getItem(key);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    await AsyncStorage.removeItem(key);
  }
}

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    accessToken: string;
    refreshToken: string;
    // Campos opcionales del perfil extendido
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
        // BUG-018: Tokens JWT en SecureStore, datos de perfil en AsyncStorage
        if (userData.accessToken)  await secureSet(SECURE_KEYS.ACCESS_TOKEN,  userData.accessToken);
        if (userData.refreshToken) await secureSet(SECURE_KEYS.REFRESH_TOKEN, userData.refreshToken);
        // userInfo sin tokens sensibles en AsyncStorage (OK para metadatos)
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
            // BUG-035: EAS_PROJECT_ID_PLACEHOLDER nombre más descriptivo
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            const EAS_PROJECT_ID_PLACEHOLDER = 'REEMPLAZAR_CON_TU_EAS_PROJECT_ID';
            const isValidProjectId = projectId && projectId !== EAS_PROJECT_ID_PLACEHOLDER;
            if (isValidProjectId) {
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                if (tokenData?.data) await removeTokenFromBackend(tokenData.data);
            }
        } catch (e) {
            if (__DEV__) console.log('[AuthStore] Error al remover push token:', e);
        }

        // BUG-018: Borrar tokens del SecureStore
        await secureDelete(SECURE_KEYS.ACCESS_TOKEN);
        await secureDelete(SECURE_KEYS.REFRESH_TOKEN);
        await AsyncStorage.multiRemove(['userInfo', 'lastCompletedRideId']);
        eventManager.reset(); // FIX-4: limpiar listeners y eventos procesados antes de desconectar
        socketService.disconnect();
        set({ user: null });
    },
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            // BUG-018: Leer token del SecureStore
            const token = await secureGet(SECURE_KEYS.ACCESS_TOKEN);
            const userInfoStr = await AsyncStorage.getItem('userInfo');

            if (!token || !userInfoStr) {
                set({ user: null });
                return;
            }

            // Restaurar inmediatamente desde AsyncStorage para evitar flash de login
            const cachedUser = JSON.parse(userInfoStr);
            // Reconstituir con el token real del SecureStore
            const fullUser = { ...cachedUser, accessToken: token };
            set({ user: fullUser });
            set({ isLoading: false }); // FIX 1: Desbloquea la UI de inmediato antes del API call

            try {
                // Verificar token con el backend (silencioso, sin mostrar alert)
                const res = await client.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` },
                    // @ts-ignore — flag interno para suprimir alert de red en el interceptor
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
                    // Token inválido o expirado — cerrar sesión
                    await secureDelete(SECURE_KEYS.ACCESS_TOKEN);
                    await secureDelete(SECURE_KEYS.REFRESH_TOKEN);
                    await AsyncStorage.multiRemove(['userInfo', 'lastCompletedRideId']);
                    set({ user: null });
                }
                // Cualquier otro error (red, timeout, 5xx) → mantener sesión local
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
