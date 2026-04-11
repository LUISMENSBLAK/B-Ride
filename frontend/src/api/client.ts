import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

// For Android emulator it usually is 10.0.2.2.
// For iOS simulator, localhost works.
const defaultURL = Platform.OS === 'android' ? 'http://10.0.2.2:5001/api' : 'http://localhost:5001/api';
const baseURL = process.env.EXPO_PUBLIC_API_URL || defaultURL;

const client = axios.create({
    baseURL,
});

client.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

client.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = await AsyncStorage.getItem('refreshToken');
                if (!refreshToken) {
                    // LAUNCH 8 FIX: Hacer logout del store
                    const { useAuthStore } = require('../store/authStore');
                    useAuthStore.getState().logout();
                    return Promise.reject(error);
                }

                const res = await axios.post(`${baseURL}/auth/refresh`, { token: refreshToken });

                if (res.data.success && res.data.accessToken) {
                    const newAccessToken = res.data.accessToken;
                    await AsyncStorage.setItem('userToken', newAccessToken);
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return client(originalRequest);
                }
            } catch (err) {
                // LAUNCH 8 FIX: Refresh falló → logout completo del store
                try {
                    const { useAuthStore } = require('../store/authStore');
                    await useAuthStore.getState().logout();
                } catch (logoutErr) {
                    // Fallback: limpiar manualmente
                    await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
                }
                return Promise.reject(err);
            }
        }

        return Promise.reject(error);
    }
);

export default client;
