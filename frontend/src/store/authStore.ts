import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

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
            // Eliminar token en backend primero
            const Constants = require('expo-constants').default;
            const Notifications = require('expo-notifications');
            const { removeTokenFromBackend } = require('../services/notifications/NotificationService');
            
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId 
                              ?? Constants?.easConfig?.projectId;

            // Guard: Saltar si el projectId es el placeholder o está indefinido
            const PLACEHOLDER = 'REEMPLAZAR_CON_TU_EAS_PROJECT_ID';
            const isValidProjectId = projectId && projectId !== PLACEHOLDER;

            if (isValidProjectId) {
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                if (tokenData && tokenData.data) {
                    await removeTokenFromBackend(tokenData.data);
                }
            }
        } catch (e) {
            if (__DEV__) console.log('[AuthStore] Error al remover push token al hacer logout:', e);
        }

        // Limpiar todo en un solo round-trip
        await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
        set({ user: null });
    },
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const token = await AsyncStorage.getItem('userToken');
            const userInfoStr = await AsyncStorage.getItem('userInfo');

            if (token && userInfoStr) {
                // BUG 18 FIX: Validar token contra el backend antes de restaurar sesión
                try {
                    const res = await client.get('/auth/me');
                    // In case interceptor refreshed the token, read from AsyncStorage again
                    const freshToken = await AsyncStorage.getItem('userToken');
                    const freshUserInfo = await AsyncStorage.getItem('userInfo');
                    const userObj = freshUserInfo ? JSON.parse(freshUserInfo) : JSON.parse(userInfoStr);
                    
                    userObj.accessToken = freshToken || userObj.accessToken;
                    // Mute profile updates from /auth/me
                    if (res.data && res.data.data) Object.assign(userObj, res.data.data);
                    
                    set({ user: userObj });
                } catch (validationError: any) {
                    if (validationError.response?.status === 401) {
                        // Token expirado — limpiar sesión silenciosamente
                        console.warn('[AuthStore] Token expirado, cerrando sesión automáticamente');
                        await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
                        set({ user: null });
                    } else {
                        // Error de red u otro — permitir acceso offline con token cacheado
                        set({ user: JSON.parse(userInfoStr) });
                    }
                }
            } else {
                set({ user: null });
            }
        } catch (e) {
            // Error restoring token
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
