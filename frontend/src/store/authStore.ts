import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { removeTokenFromBackend } from '../services/notifications/NotificationService';
import socketService from '../services/socket';

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
        const entries: [string, string][] = [
            ['userInfo', JSON.stringify(userData)],
        ];
        if (userData.accessToken) entries.push(['userToken', userData.accessToken]);
        if (userData.refreshToken) entries.push(['refreshToken', userData.refreshToken]);
        await AsyncStorage.multiSet(entries);
        set({ user: userData, justRegistered: false });
    },
    register: async (userData) => {
        const entries: [string, string][] = [
            ['userInfo', JSON.stringify(userData)],
        ];
        if (userData.accessToken) entries.push(['userToken', userData.accessToken]);
        if (userData.refreshToken) entries.push(['refreshToken', userData.refreshToken]);
        await AsyncStorage.multiSet(entries);
        set({ user: userData, justRegistered: true });
    },
    logout: async () => {
        
        try {
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            const PLACEHOLDER = 'REEMPLAZAR_CON_TU_EAS_PROJECT_ID';
            const isValidProjectId = projectId && projectId !== PLACEHOLDER;
            if (isValidProjectId) {
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                if (tokenData?.data) await removeTokenFromBackend(tokenData.data);
            }
        } catch (e) {
            if (__DEV__) console.log('[AuthStore] Error al remover push token:', e);
        }

        await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
        socketService.disconnect();
        set({ user: null });
    },
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const token = await AsyncStorage.getItem('userToken');
            const userInfoStr = await AsyncStorage.getItem('userInfo');

            if (!token || !userInfoStr) {
                set({ user: null });
                return;
            }

            // Restaurar inmediatamente desde AsyncStorage para evitar flash de login
            const cachedUser = JSON.parse(userInfoStr);
            set({ user: cachedUser });

            try {
                // Verificar token con el backend (silencioso, sin mostrar alert)
                const res = await client.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` },
                    // @ts-ignore — flag interno para suprimir alert de red en el interceptor
                    _silent: true,
                });
                if (res.data?.data) {
                    const merged = { ...cachedUser, ...res.data.data, accessToken: token };
                    await AsyncStorage.setItem('userInfo', JSON.stringify(merged));
                    set({ user: merged });
                }
            } catch (apiErr: any) {
                const status = apiErr?.response?.status;
                if (status === 401 || status === 403) {
                    // Token inválido o expirado — cerrar sesión
                    await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
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
            AsyncStorage.setItem('userInfo', JSON.stringify(updated)).catch(() => {});
            return { user: updated };
        });
    },
    clearJustRegistered: () => {
        set({ justRegistered: false });
    },
}));
