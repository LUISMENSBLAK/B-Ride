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
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    login: (userData: User) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    updateUser: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    login: async (userData) => {
        if (userData.accessToken) {
            await AsyncStorage.setItem('userToken', userData.accessToken);
        }
        if (userData.refreshToken) {
            await AsyncStorage.setItem('refreshToken', userData.refreshToken);
        }
        await AsyncStorage.setItem('userInfo', JSON.stringify(userData));
        set({ user: userData });
    },
    logout: async () => {
        try {
            // Eliminar token en backend primero
            const Constants = require('expo-constants').default;
            const Notifications = require('expo-notifications');
            const { removeTokenFromBackend } = require('../services/notifications/NotificationService');
            
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId 
                              ?? Constants?.easConfig?.projectId;

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            if (tokenData && tokenData.data) {
                await removeTokenFromBackend(tokenData.data);
            }
        } catch (e) {
            console.log('[AuthStore] Error al remover push token al hacer logout:', e);
        }

        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('refreshToken');
        await AsyncStorage.removeItem('userInfo');
        // BUG 20 FIX: Limpiar recibo cacheado del usuario anterior
        await AsyncStorage.removeItem('lastCompletedRideId');
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
                    await client.get('/auth/me');
                    set({ user: JSON.parse(userInfoStr) });
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
}));
