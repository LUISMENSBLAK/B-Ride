import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { removeTokenFromBackend } from '../services/notifications/NotificationService';
import socketService from '../services/socket';
import eventManager from '../services/EventManager'; // FIX-4: import para limpiar en logout

// BUG-018 NOTE: expo-secure-store requiere rebuild nativo (npx expo run:ios).
// En Expo Go usamos AsyncStorage con prefijo para diferenciar tokens sensibles.
// TODO: Migrar a SecureStore en el build de producción.
// keys con prefijo b_ride_ para evitar colisiones
const TOKEN_KEYS = {
  ACCESS:  'b_ride_access_token',
  REFRESH: 'b_ride_refresh_token',
  USER_INFO: 'b_ride_user_info',
} as const;

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
        // Guardar tokens y metadata por separado para facilitar migración futura a SecureStore
        const entries: [string, string][] = [[TOKEN_KEYS.USER_INFO, JSON.stringify(userData)]];
        if (userData.accessToken)  entries.push([TOKEN_KEYS.ACCESS,  userData.accessToken]);
        if (userData.refreshToken) entries.push([TOKEN_KEYS.REFRESH, userData.refreshToken]);
        // Compatibilidad hacia atrás (algunos interceptores leen 'userToken')
        if (userData.accessToken)  entries.push(['userToken',      userData.accessToken]);
        if (userData.refreshToken) entries.push(['refreshToken',   userData.refreshToken]);
        entries.push(['userInfo', JSON.stringify(userData)]);
        await AsyncStorage.multiSet(entries);
        set({ user: userData, justRegistered: false });
    },
    register: async (userData) => {
        const entries: [string, string][] = [[TOKEN_KEYS.USER_INFO, JSON.stringify(userData)]];
        if (userData.accessToken)  entries.push([TOKEN_KEYS.ACCESS,  userData.accessToken]);
        if (userData.refreshToken) entries.push([TOKEN_KEYS.REFRESH, userData.refreshToken]);
        if (userData.accessToken)  entries.push(['userToken',      userData.accessToken]);
        if (userData.refreshToken) entries.push(['refreshToken',   userData.refreshToken]);
        entries.push(['userInfo', JSON.stringify(userData)]);
        await AsyncStorage.multiSet(entries);
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

        await AsyncStorage.multiRemove([
          TOKEN_KEYS.ACCESS, TOKEN_KEYS.REFRESH, TOKEN_KEYS.USER_INFO,
          'userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId',
        ]);
        eventManager.reset(); // FIX-4: limpiar listeners y eventos procesados antes de desconectar
        socketService.disconnect();
        set({ user: null });
    },
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            // Leer token: primero desde las nuevas claves, luego legacy
            const token = await AsyncStorage.getItem(TOKEN_KEYS.ACCESS)
                       ?? await AsyncStorage.getItem('userToken');
            const userInfoStr = await AsyncStorage.getItem(TOKEN_KEYS.USER_INFO)
                             ?? await AsyncStorage.getItem('userInfo');

            if (!token || !userInfoStr) {
                set({ user: null });
                return;
            }

            // Restaurar inmediatamente desde AsyncStorage para evitar flash de login
            const cachedUser = JSON.parse(userInfoStr);
            set({ user: cachedUser });
            set({ isLoading: false }); // FIX 1: Desbloquea la UI de inmediato antes del API call

            try {
                // Verificar token con el backend (silencioso, sin mostrar alert)
                const res = await client.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` },
                    // @ts-ignore — flag interno para suprimir alert de red en el interceptor
                    _silent: true,
                });
                if (res.data?.data) {
                    const merged = { ...cachedUser, ...res.data.data, accessToken: token };
                    await AsyncStorage.setItem(TOKEN_KEYS.USER_INFO, JSON.stringify(merged));
                    await AsyncStorage.setItem('userInfo', JSON.stringify(merged));
                    set({ user: merged });
                }
            } catch (apiErr: unknown) {
                const status = (apiErr as { response?: { status?: number } })?.response?.status;
                if (status === 401 || status === 403) {
                    // Token inválido o expirado — cerrar sesión
                    await AsyncStorage.multiRemove([
                      TOKEN_KEYS.ACCESS, TOKEN_KEYS.REFRESH, TOKEN_KEYS.USER_INFO,
                      'userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId',
                    ]);
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
            AsyncStorage.setItem(TOKEN_KEYS.USER_INFO, JSON.stringify(updated)).catch(() => {});
            AsyncStorage.setItem('userInfo', JSON.stringify(updated)).catch(() => {});
            return { user: updated };
        });
    },
    clearJustRegistered: () => {
        set({ justRegistered: false });
    },
}));
